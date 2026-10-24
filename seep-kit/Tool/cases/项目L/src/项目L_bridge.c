// ============================================================================
//  bridge.c —— 项目L 内嵌本地翻译网关
//
//  作用: 在 项目L 进程内起一个 127.0.0.1 的 HTTP 服务, 把 项目L 的翻译
//        请求转换成「任意大模型 API」调用, 再把结果翻译回 项目L 的格式。
//
//  架构:
//      项目L  {API_ENDPOINT} = http://127.0.0.1:<port>
//         │
//         ├─ /api2/ai/translate/*  ──▶ 调用用户配置的大模型 API (WinHTTP/HTTPS)
//         │                              └─▶ 返回 项目L 期望的 JSON
//         └─ 其它请求              ──▶ 透明转发到 https://api.项目L.cn
//
//  支持的大模型 API 风格 (自动识别):
//      * OpenAI 兼容  (/chat/completions)  —— OpenAI / DeepSeek / Kimi / 智谱 /
//                                            通义 / one-api / Ollama / LM Studio ...
//      * Google Gemini (generativelanguage.googleapis.com)
//      * Anthropic    (/v1/messages)
//
//  配置 (项目L_hook.ini):
//      llm_url   大模型接口地址 (UI 的 APP ID 栏)
//      llm_key   大模型 API Key (UI 的 密钥 栏)
//      llm_model 可选, 覆盖默认模型名
//      llm_style 可选, auto | openai | gemini | anthropic
// ============================================================================
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <winhttp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "项目L_bridge.h"

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "winhttp.lib")

#define BRIDGE_DEFAULT_PORT 8787
#define BRIDGE_MAX_BODY     (8 * 1024 * 1024)

void HookLog(const char* fmt, ...);   // 由 hook.c 提供

static int g_llmTimeoutMs = 60000;   // 大模型请求超时 (ms)

// ============================================================================
//  极简 JSON (解析 + 提取)
// ============================================================================
typedef enum { JNULL, JBOOL, JNUM, JSTR, JARR, JOBJ } JType;

typedef struct JVal {
    JType t;
    double num;
    int    bval;
    char*  str;              // JSTR (UTF-8, 已反转义)
    struct JVal** items;     // JARR / JOBJ
    char** keys;             // JOBJ
    int    n, cap;
} JVal;

static JVal* jnew(JType t) {
    JVal* v = (JVal*)calloc(1, sizeof(JVal));
    if (v) v->t = t;
    return v;
}
static void jpush(JVal* arr, JVal* item, char* key) {
    /* 防御: items 为空或容量不足时都必须分配 */
    if (!arr->items || arr->n >= arr->cap) {
        int nc = arr->cap ? arr->cap * 2 : 8;
        if (nc <= arr->n) nc = arr->n + 8;
        arr->items = (JVal**)realloc(arr->items, sizeof(JVal*) * nc);
        if (arr->keys) arr->keys = (char**)realloc(arr->keys, sizeof(char*) * nc);
        arr->cap = nc;
    }
    if (!arr->items) return;
    if (arr->keys && key) arr->keys[arr->n] = key;
    arr->items[arr->n++] = item;
}

void json_free(JVal* v) {
    int i;
    if (!v) return;
    if (v->str) free(v->str);
    for (i = 0; i < v->n; i++) json_free(v->items[i]);
    if (v->items) free(v->items);
    if (v->keys) {
        for (i = 0; i < v->n; i++) if (v->keys[i]) free(v->keys[i]);
        free(v->keys);
    }
    free(v);
}

typedef struct { const char* s; int len, pos; } JParser;

static void jskip(JParser* p) {
    while (p->pos < p->len) {
        char c = p->s[p->pos];
        if (c == ' ' || c == '\t' || c == '\r' || c == '\n') p->pos++;
        else break;
    }
}
static JVal* jvalue(JParser* p);

static char* jstring(JParser* p) {
    int cap = 64, len = 0;
    char* out;
    if (p->pos >= p->len || p->s[p->pos] != '"') return NULL;
    p->pos++;
    out = (char*)malloc(cap);
    while (p->pos < p->len) {
        unsigned char c = (unsigned char)p->s[p->pos++];
        if (c == '"') break;
        if (c == '\\' && p->pos < p->len) {
            char e = p->s[p->pos++];
            switch (e) {
                case 'n': c = '\n'; break;
                case 't': c = '\t'; break;
                case 'r': c = '\r'; break;
                case 'b': c = '\b'; break;
                case 'f': c = '\f'; break;
                case '/': c = '/';  break;
                case '"': c = '"';  break;
                case '\\': c = '\\'; break;
                case 'u': {
                    unsigned cp = 0; int k;
                    for (k = 0; k < 4 && p->pos < p->len; k++) {
                        char h = p->s[p->pos++]; cp <<= 4;
                        if (h >= '0' && h <= '9') cp |= (h - '0');
                        else if (h >= 'a' && h <= 'f') cp |= (h - 'a' + 10);
                        else if (h >= 'A' && h <= 'F') cp |= (h - 'A' + 10);
                    }
                    if (cp >= 0xD800 && cp <= 0xDBFF && p->pos + 5 < p->len &&
                        p->s[p->pos] == '\\' && p->s[p->pos+1] == 'u') {
                        unsigned lo = 0; p->pos += 2;
                        for (k = 0; k < 4 && p->pos < p->len; k++) {
                            char h = p->s[p->pos++]; lo <<= 4;
                            if (h >= '0' && h <= '9') lo |= (h - '0');
                            else if (h >= 'a' && h <= 'f') lo |= (h - 'a' + 10);
                            else if (h >= 'A' && h <= 'F') lo |= (h - 'A' + 10);
                        }
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                    }
                    if (len + 4 >= cap) { cap *= 2; out = (char*)realloc(out, cap); }
                    if (cp < 0x80) out[len++] = (char)cp;
                    else if (cp < 0x800) {
                        out[len++] = (char)(0xC0 | (cp >> 6));
                        out[len++] = (char)(0x80 | (cp & 0x3F));
                    } else if (cp < 0x10000) {
                        out[len++] = (char)(0xE0 | (cp >> 12));
                        out[len++] = (char)(0x80 | ((cp >> 6) & 0x3F));
                        out[len++] = (char)(0x80 | (cp & 0x3F));
                    } else {
                        out[len++] = (char)(0xF0 | (cp >> 18));
                        out[len++] = (char)(0x80 | ((cp >> 12) & 0x3F));
                        out[len++] = (char)(0x80 | ((cp >> 6) & 0x3F));
                        out[len++] = (char)(0x80 | (cp & 0x3F));
                    }
                    continue;
                }
                default: c = (unsigned char)e; break;
            }
        }
        if (len + 2 >= cap) { cap *= 2; out = (char*)realloc(out, cap); }
        out[len++] = (char)c;
    }
    if (len + 1 >= cap) { cap += 1; out = (char*)realloc(out, cap); }
    out[len] = 0;
    return out;
}

static JVal* jvalue(JParser* p) {
    jskip(p);
    if (p->pos >= p->len) return NULL;
    char c = p->s[p->pos];
    if (c == '{') {
        JVal* o = jnew(JOBJ);
        o->keys  = (char**)calloc(8, sizeof(char*));
        o->items = (JVal**)calloc(8, sizeof(JVal*));
        o->cap = 8;
        if (!o->keys || !o->items) { json_free(o); return NULL; }
        p->pos++;
        jskip(p);
        if (p->pos < p->len && p->s[p->pos] == '}') { p->pos++; return o; }
        while (p->pos < p->len) {
            char* k;
            JVal* v;
            jskip(p);
            k = jstring(p);
            jskip(p);
            if (p->pos < p->len && p->s[p->pos] == ':') p->pos++;
            v = jvalue(p);
            jpush(o, v, k);
            jskip(p);
            if (p->pos < p->len && p->s[p->pos] == ',') { p->pos++; continue; }
            if (p->pos < p->len && p->s[p->pos] == '}') { p->pos++; break; }
            break;
        }
        return o;
    }
    if (c == '[') {
        JVal* a = jnew(JARR);
        p->pos++;
        jskip(p);
        if (p->pos < p->len && p->s[p->pos] == ']') { p->pos++; return a; }
        while (p->pos < p->len) {
            JVal* v = jvalue(p);
            jpush(a, v, NULL);
            jskip(p);
            if (p->pos < p->len && p->s[p->pos] == ',') { p->pos++; continue; }
            if (p->pos < p->len && p->s[p->pos] == ']') { p->pos++; break; }
            break;
        }
        return a;
    }
    if (c == '"') { JVal* v = jnew(JSTR); v->str = jstring(p); return v; }
    if (!strncmp(p->s + p->pos, "true", 4))  { p->pos += 4; { JVal* v = jnew(JBOOL); v->bval = 1; return v; } }
    if (!strncmp(p->s + p->pos, "false", 5)) { p->pos += 5; { JVal* v = jnew(JBOOL); v->bval = 0; return v; } }
    if (!strncmp(p->s + p->pos, "null", 4))  { p->pos += 4; return jnew(JNULL); }
    {
        char buf[64]; int n = 0;
        while (p->pos < p->len && n < 63) {
            char d = p->s[p->pos];
            if ((d >= '0' && d <= '9') || d == '-' || d == '+' || d == '.' || d == 'e' || d == 'E') { buf[n++] = d; p->pos++; }
            else break;
        }
        buf[n] = 0;
        { JVal* v = jnew(JNUM); v->num = atof(buf); return v; }
    }
}

JVal* json_parse(const char* s, int len) {
    JParser p;
    if (!s) return NULL;
    p.s = s; p.len = (len < 0) ? (int)strlen(s) : len; p.pos = 0;
    return jvalue(&p);
}

JVal* json_get(JVal* o, const char* key) {
    int i;
    if (!o || o->t != JOBJ || !o->keys) return NULL;
    for (i = 0; i < o->n; i++)
        if (o->keys[i] && !strcmp(o->keys[i], key)) return o->items[i];
    return NULL;
}
JVal* json_at(JVal* a, int idx) {
    if (!a || a->t != JARR || idx < 0 || idx >= a->n) return NULL;
    return a->items[idx];
}
const char* json_str(JVal* v) { return (v && v->t == JSTR && v->str) ? v->str : NULL; }
int json_int(JVal* v, int def) { return (v && v->t == JNUM) ? (int)v->num : def; }

// ---------------- 序列化辅助 ----------------
typedef struct { char* p; int len, cap; } SBuf;

static void sb_init(SBuf* b) { b->cap = 1024; b->len = 0; b->p = (char*)malloc(b->cap); b->p[0] = 0; }
static void sb_need(SBuf* b, int extra) {
    if (b->len + extra + 1 > b->cap) {
        while (b->len + extra + 1 > b->cap) b->cap *= 2;
        b->p = (char*)realloc(b->p, b->cap);
    }
}
static void sb_raw(SBuf* b, const char* s, int n) {
    if (n < 0) n = (int)strlen(s);
    sb_need(b, n);
    memcpy(b->p + b->len, s, n);
    b->len += n;
    b->p[b->len] = 0;
}
static void sb_str(SBuf* b, const char* s) { if (s) sb_raw(b, s, -1); }
static void sb_esc(SBuf* b, const char* s) {
    sb_need(b, (int)strlen(s) * 6 + 4);
    b->p[b->len++] = '"';
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        switch (c) {
            case '"':  sb_raw(b, "\\\"", 2); break;
            case '\\': sb_raw(b, "\\\\", 2); break;
            case '\n': sb_raw(b, "\\n", 2);  break;
            case '\r': sb_raw(b, "\\r", 2);  break;
            case '\t': sb_raw(b, "\\t", 2);  break;
            default:
                if (c < 0x20) {
                    char tmp[8];
                    sprintf(tmp, "\\u%04X", c);
                    sb_raw(b, tmp, 6);
                } else {
                    sb_need(b, 2);
                    b->p[b->len++] = (char)c;
                }
        }
    }
    sb_need(b, 2);
    b->p[b->len++] = '"';
    b->p[b->len] = 0;
}

// ============================================================================
//  WinHTTP 客户端
// ============================================================================
typedef struct { char* data; int len; int status; } HttpResp;

static wchar_t* u2w(const char* s) {
    int n = MultiByteToWideChar(CP_UTF8, 0, s, -1, NULL, 0);
    wchar_t* w = (wchar_t*)malloc(sizeof(wchar_t) * (n + 1));
    MultiByteToWideChar(CP_UTF8, 0, s, -1, w, n + 1);
    return w;
}
static char* w2u(const wchar_t* w, int wlen) {
    int n = WideCharToMultiByte(CP_UTF8, 0, w, wlen, NULL, 0, NULL, NULL);
    char* s = (char*)malloc(n + 1);
    WideCharToMultiByte(CP_UTF8, 0, w, wlen, s, n, NULL, NULL);
    s[n] = 0;
    return s;
}

// 发一个 HTTPS/HTTP 请求。headers 为 "\r\n" 分隔的额外头
int http_request(const char* method, const char* url,
                 const char* extraHeaders, const char* body, int bodyLen,
                 HttpResp* out, int timeoutMs)
{
    wchar_t* wurl = NULL, *whost = NULL, *wpath = NULL, *wmethod = NULL;
    URL_COMPONENTS uc;
    HINTERNET hS = NULL, hC = NULL, hR = NULL;
    int ok = 0;
    char* resp = NULL;
    int respLen = 0, respCap = 0;

    memset(out, 0, sizeof(*out));
    memset(&uc, 0, sizeof(uc));
    uc.dwStructSize = sizeof(uc);
    uc.dwSchemeLength = uc.dwHostNameLength = uc.dwUrlPathLength = uc.dwExtraInfoLength = (DWORD)-1;
    wurl = u2w(url);
    if (!WinHttpCrackUrl(wurl, 0, 0, &uc)) { HookLog("bridge: bad url %s", url); goto done; }

    whost = (wchar_t*)malloc((uc.dwHostNameLength + 1) * sizeof(wchar_t));
    wcsncpy(whost, uc.lpszHostName, uc.dwHostNameLength); whost[uc.dwHostNameLength] = 0;
    {
        int plen = uc.dwUrlPathLength + uc.dwExtraInfoLength;
        wpath = (wchar_t*)malloc((plen + 1) * sizeof(wchar_t));
        if (plen) wcsncpy(wpath, uc.lpszUrlPath, plen);
        wpath[plen] = 0;
    }
    wmethod = u2w(method);

    hS = WinHttpOpen(L"项目LHook/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                     WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hS) { HookLog("bridge: WinHttpOpen failed %lu", GetLastError()); goto done; }
    WinHttpSetTimeouts(hS, timeoutMs, timeoutMs, timeoutMs, timeoutMs);

    hC = WinHttpConnect(hS, whost, uc.nPort, 0);
    if (!hC) { HookLog("bridge: WinHttpConnect failed %lu", GetLastError()); goto done; }

    hR = WinHttpOpenRequest(hC, wmethod, wpath, NULL, WINHTTP_NO_REFERER,
                            WINHTTP_DEFAULT_ACCEPT_TYPES,
                            (uc.nScheme == INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0);
    if (!hR) { HookLog("bridge: WinHttpOpenRequest failed %lu", GetLastError()); goto done; }

    if (extraHeaders && *extraHeaders) {
        wchar_t* wh = u2w(extraHeaders);
        WinHttpAddRequestHeaders(hR, wh, (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE);
        free(wh);
    }

    if (!WinHttpSendRequest(hR, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                            (LPVOID)(bodyLen > 0 ? body : NULL), bodyLen,
                            bodyLen, 0)) {
        HookLog("bridge: WinHttpSendRequest failed %lu", GetLastError());
        goto done;
    }
    if (!WinHttpReceiveResponse(hR, NULL)) {
        HookLog("bridge: WinHttpReceiveResponse failed %lu", GetLastError());
        goto done;
    }
    {
        DWORD code = 0, sz = sizeof(code);
        WinHttpQueryHeaders(hR, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                            WINHTTP_HEADER_NAME_BY_INDEX, &code, &sz, WINHTTP_NO_HEADER_INDEX);
        out->status = (int)code;
    }
    for (;;) {
        DWORD avail = 0;
        if (!WinHttpQueryDataAvailable(hR, &avail)) break;
        if (avail == 0) break;
        if (respLen + avail + 1 > respCap) {
            respCap = respLen + avail + 65536;
            resp = (char*)realloc(resp, respCap);
        }
        {
            DWORD got = 0;
            if (!WinHttpReadData(hR, resp + respLen, avail, &got)) break;
            if (got == 0) break;
            respLen += got;
        }
        if (respLen > 32 * 1024 * 1024) break;
    }
    if (!resp) { resp = (char*)malloc(1); }
    resp[respLen] = 0;
    out->data = resp;
    out->len = respLen;
    ok = 1;

done:
    if (hR) WinHttpCloseHandle(hR);
    if (hC) WinHttpCloseHandle(hC);
    if (hS) WinHttpCloseHandle(hS);
    if (wurl) free(wurl);
    if (whost) free(whost);
    if (wpath) free(wpath);
    if (wmethod) free(wmethod);
    if (!ok && resp) free(resp);
    return ok;
}

// ============================================================================
//  大模型引擎
// ============================================================================
typedef enum { STYLE_AUTO = 0, STYLE_OPENAI, STYLE_GEMINI, STYLE_ANTHROPIC } ApiStyle;

static const char* lang_name(const char* l) {
    if (!l) return "the target language";
    if (!_stricmp(l, "zh-cn") || !_stricmp(l, "zh")) return "Chinese (Simplified)";
    if (!_stricmp(l, "zh-tw") || !_stricmp(l, "zh-hk")) return "Chinese (Traditional)";
    if (!_stricmp(l, "en")) return "English";
    if (!_stricmp(l, "ja")) return "Japanese";
    if (!_stricmp(l, "ko")) return "Korean";
    if (!_stricmp(l, "fr")) return "French";
    if (!_stricmp(l, "de")) return "German";
    if (!_stricmp(l, "es")) return "Spanish";
    if (!_stricmp(l, "ru")) return "Russian";
    return l;
}

static int detect_style(const char* url) {
    if (!url) return STYLE_OPENAI;
    if (strstr(url, "generativelanguage.googleapis.com")) return STYLE_GEMINI;
    if (strstr(url, "anthropic.com")) return STYLE_ANTHROPIC;
    return STYLE_OPENAI;
}

static const char* default_model(const char* url) {
    if (!url) return "gpt-4o-mini";
    if (strstr(url, "generativelanguage.googleapis.com")) return "gemini-2.5-flash";
    if (strstr(url, "api.deepseek.com")) return "deepseek-chat";
    if (strstr(url, "api.moonshot.cn")) return "moonshot-v1-8k";
    if (strstr(url, "bigmodel.cn")) return "glm-4-flash";
    if (strstr(url, "dashscope.aliyuncs.com")) return "qwen-turbo";
    if (strstr(url, "localhost") || strstr(url, "127.0.0.1")) return "qwen2.5";
    if (strstr(url, "api.openai.com")) return "gpt-4o-mini";
    return "gpt-4o-mini";
}

// 从 URL 里取 model=xxx 覆盖
static void url_model(const char* url, char* out, int outSz) {
    const char* p = strstr(url, "model=");
    int i = 0;
    out[0] = 0;
    if (!p) return;
    p += 6;
    while (*p && *p != '&' && i < outSz - 1) out[i++] = *p++;
    out[i] = 0;
}

// 去掉 URL 里的 model= 参数 (不传给大模型)
static void url_strip_model(const char* url, char* out, int outSz) {
    const char* p = strstr(url, "model=");
    int n;
    if (!p) { strncpy(out, url, outSz - 1); out[outSz - 1] = 0; return; }
    n = (int)(p - url);
    while (n > 0 && (url[n-1] == '?' || url[n-1] == '&')) n--;
    if (n >= outSz) n = outSz - 1;
    memcpy(out, url, n);
    out[n] = 0;
}

// 调用大模型, 返回译文 (malloc), 失败返回 NULL
char* llm_translate(const char* text, const char* srcLang, const char* tgtLang,
                    const BridgeConfig* cfg)
{
    SBuf body, sysPrompt;
    HttpResp resp;
    char* result = NULL;
    char model[128], cleanUrl[1024];
    int style;

    if (!cfg->llmUrl[0]) { HookLog("bridge: llm_url 未配置"); return NULL; }
    if (!text || !*text) return NULL;

    style = (cfg->llmStyle > 0) ? cfg->llmStyle : detect_style(cfg->llmUrl);

    url_model(cfg->llmUrl, model, sizeof(model));
    if (!model[0] && cfg->llmModel[0]) strncpy(model, cfg->llmModel, sizeof(model) - 1);
    if (!model[0]) strncpy(model, default_model(cfg->llmUrl), sizeof(model) - 1);
    url_strip_model(cfg->llmUrl, cleanUrl, sizeof(cleanUrl));

    sb_init(&sysPrompt);
    sb_str(&sysPrompt, "You are a professional translator. Translate the user's text into ");
    sb_str(&sysPrompt, lang_name(tgtLang));
    sb_str(&sysPrompt, ". Output ONLY the translated text - no explanations, no quotes, no markdown, no extra words.");

    sb_init(&body);
    {
        SBuf user;
        sb_init(&user);
        sb_str(&user, "Translate the following text into ");
        sb_str(&user, lang_name(tgtLang));
        sb_str(&user, ":\n\n");
        sb_str(&user, text);
        (void)srcLang;

        if (style == STYLE_GEMINI) {
            char* sep = strchr(cleanUrl, '?');
            sb_str(&body, "{\"systemInstruction\":{\"parts\":[{\"text\":");
            sb_esc(&body, sysPrompt.p);
            sb_str(&body, "}]},\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":");
            sb_esc(&body, user.p);
            sb_str(&body, "}]}],\"generationConfig\":{\"temperature\":0.2}}");
            free(user.p);
            (void)sep;
        } else if (style == STYLE_ANTHROPIC) {
            sb_str(&body, "{\"model\":");
            sb_esc(&body, model);
            sb_str(&body, ",\"max_tokens\":4096,\"system\":");
            sb_esc(&body, sysPrompt.p);
            sb_str(&body, ",\"messages\":[{\"role\":\"user\",\"content\":");
            sb_esc(&body, user.p);
            sb_str(&body, "}]}");
            free(user.p);
        } else {
            sb_str(&body, "{\"model\":");
            sb_esc(&body, model);
            sb_str(&body, ",\"messages\":[{\"role\":\"system\",\"content\":");
            sb_esc(&body, sysPrompt.p);
            sb_str(&body, "},{\"role\":\"user\",\"content\":");
            sb_esc(&body, user.p);
            sb_str(&body, "}],\"temperature\":0.2}");
            free(user.p);
        }
    }
    free(sysPrompt.p);

    {
        SBuf hdr;
        char realUrl[1200];
        sb_init(&hdr);
        sb_str(&hdr, "Content-Type: application/json\r\n");

        if (style == STYLE_GEMINI) {
            /* 智能处理 Gemini 端点:
             * 无论用户输入 https://generativelanguage.googleapis.com
             * 还是完整带模型名路径, 都自动规范为正确形式 */
            if (strstr(cleanUrl, ":generateContent")) {
                const char* q = strchr(cleanUrl, '?');
                if (q) sprintf(realUrl, "%.*s?%skey=%s", (int)(q - cleanUrl), cleanUrl, q + 1, cfg->llmKey);
                else   sprintf(realUrl, "%s?key=%s", cleanUrl, cfg->llmKey);
            } else {
                sprintf(realUrl, "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
                        model[0] ? model : "gemini-2.5-flash", cfg->llmKey);
            }
        } else if (style == STYLE_ANTHROPIC) {
            strncpy(realUrl, cleanUrl, sizeof(realUrl) - 1);
            realUrl[sizeof(realUrl)-1] = 0;
            sb_str(&hdr, "x-api-key: ");
            sb_str(&hdr, cfg->llmKey);
            sb_str(&hdr, "\r\nanthropic-version: 2023-06-01\r\n");
        } else {
            /* OpenAI 兼容格式: 确保以 /chat/completions 结尾 */
            char compUrl[1024];
            strncpy(compUrl, cleanUrl, sizeof(compUrl) - 1); compUrl[sizeof(compUrl)-1] = 0;
            if (!strstr(compUrl, "/chat/completions")) {
                int clen = (int)strlen(compUrl);
                while (clen > 0 && compUrl[clen - 1] == '/') compUrl[--clen] = 0;
                strcat(compUrl, "/v1/chat/completions");
            }
            strncpy(realUrl, compUrl, sizeof(realUrl) - 1);
            realUrl[sizeof(realUrl)-1] = 0;
            sb_str(&hdr, "Authorization: Bearer ");
            sb_str(&hdr, cfg->llmKey);
            sb_str(&hdr, "\r\n");
        }

        HookLog("bridge: -> %s (style=%d model=%s len=%d)", cleanUrl, style, model, (int)strlen(text));
        if (http_request("POST", realUrl, hdr.p, body.p, (int)strlen(body.p), &resp, g_llmTimeoutMs)) {
            JVal* j = json_parse(resp.data, resp.len);
            HookLog("bridge: <- HTTP %d (%d bytes)", resp.status, resp.len);
            if (j) {
                if (style == STYLE_GEMINI) {
                    JVal* cands = json_get(j, "candidates");
                    JVal* c0 = json_at(cands, 0);
                    JVal* cont = c0 ? json_get(c0, "content") : NULL;
                    JVal* parts = cont ? json_get(cont, "parts") : NULL;
                    int i;
                    SBuf acc; sb_init(&acc);
                    for (i = 0; parts && i < parts->n; i++) {
                        const char* t = json_str(json_get(parts->items[i], "text"));
                        if (t) sb_str(&acc, t);
                    }
                    if (acc.len) result = acc.p; else free(acc.p);
                } else if (style == STYLE_ANTHROPIC) {
                    JVal* cont = json_get(j, "content");
                    JVal* c0 = json_at(cont, 0);
                    const char* t = c0 ? json_str(json_get(c0, "text")) : NULL;
                    if (t) result = _strdup(t);
                } else {
                    JVal* ch = json_get(j, "choices");
                    JVal* c0 = json_at(ch, 0);
                    JVal* msg = c0 ? json_get(c0, "message") : NULL;
                    const char* t = msg ? json_str(json_get(msg, "content")) : NULL;
                    if (t) result = _strdup(t);
                }
                if (!result) {
                    /* 出错时把响应体带出来便于排查 */
                    const char* err = json_str(json_get(j, "error"));
                    HookLog("bridge: parse failed, body=%.300s", resp.data);
                    (void)err;
                }
                json_free(j);
            } else {
                HookLog("bridge: json parse failed, body=%.200s", resp.data);
            }
            free(resp.data);
        }
        free(hdr.p);
    }
    free(body.p);

    if (result) {
        /* 去掉模型可能包上的引号/空白 */
        int n = (int)strlen(result);
        while (n > 0 && (result[n-1] == '\n' || result[n-1] == '\r' || result[n-1] == ' ')) result[--n] = 0;
        if (n >= 2 && result[0] == '"' && result[n-1] == '"') {
            memmove(result, result + 1, n - 2);
            result[n-2] = 0;
        }
    }
    return result;
}

// ============================================================================
//  内嵌 HTTP 网关 (Winsock)
// ============================================================================
static BridgeConfig g_cfg;
static SOCKET  g_listen = INVALID_SOCKET;
static int     g_port = 0;
static volatile LONG g_stop = 0;
static HANDLE  g_hAccept = NULL;

static int has_cjk(const char* t) {
    const unsigned char* p = (const unsigned char*)t;
    while (*p) {
        if (p[0] == 0xE4 && p[1] >= 0xB8 && p[1] <= 0xBF) return 1;   // U+4E00..U+4FFF
        if (p[0] == 0xE5 && p[1] >= 0x80 && p[1] <= 0xBF) return 1;
        if (p[0] == 0xE6 && p[1] >= 0x80 && p[1] <= 0xBF) return 1;
        if (p[0] == 0xE7 && p[1] >= 0x80 && p[1] <= 0xBF) return 1;
        if (p[0] == 0xE8 && p[1] >= 0x80 && p[1] <= 0xBF) return 1;
        if (p[0] == 0xE9 && p[1] >= 0x80 && p[1] <= 0xBF) return 1;
        p++;
    }
    return 0;
}

static void eff_langs(const char* src, const char* tgt, const char* backup,
                      const char* sample, char* so, int soSz, char* to, int toSz)
{
    char s[32], t[32];
    strncpy(s, (src && *src) ? src : "auto", sizeof(s) - 1); s[sizeof(s)-1] = 0;
    strncpy(t, (tgt && *tgt) ? tgt : "zh-cn", sizeof(t) - 1); t[sizeof(t)-1] = 0;
    if (!_stricmp(s, "auto") || !s[0]) {
        strcpy(s, has_cjk(sample) ? "zh-cn" : "en");
    }
    if (!_stricmp(s, t) && backup && *backup) {
        strncpy(t, backup, sizeof(t) - 1); t[sizeof(t)-1] = 0;
    }
    strncpy(so, s, soSz - 1); so[soSz-1] = 0;
    strncpy(to, t, toSz - 1); to[toSz-1] = 0;
}

static void send_all(SOCKET s, const char* buf, int len) {
    int sent = 0;
    while (sent < len) {
        int n = send(s, buf + sent, len - sent, 0);
        if (n <= 0) break;
        sent += n;
    }
}

static void http_reply(SOCKET s, int status, const char* ctype, const char* body, int blen) {
    char hdr[512];
    const char* reason = (status == 200) ? "OK" : (status == 404 ? "Not Found" : "Error");
    int n = sprintf(hdr,
        "HTTP/1.1 %d %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %d\r\n"
        "Connection: close\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "\r\n", status, reason, ctype, blen);
    send_all(s, hdr, n);
    if (blen > 0) send_all(s, body, blen);
}


// 每次翻译请求前热重读 INI —— 用户直接编辑 项目L_hook.ini 即可即时生效
static void ReloadFromIni(void)
{
    if (!g_cfg.iniPath[0]) return;
    GetPrivateProfileStringA("translate", "llm_url",   g_cfg.llmUrl,   g_cfg.llmUrl,   sizeof(g_cfg.llmUrl),   g_cfg.iniPath);
    GetPrivateProfileStringA("translate", "llm_key",   g_cfg.llmKey,   g_cfg.llmKey,   sizeof(g_cfg.llmKey),   g_cfg.iniPath);
    GetPrivateProfileStringA("translate", "llm_model", g_cfg.llmModel, g_cfg.llmModel, sizeof(g_cfg.llmModel), g_cfg.iniPath);
    g_cfg.llmStyle = GetPrivateProfileIntA("translate", "llm_style", 0, g_cfg.iniPath);
}

// ---- 翻译处理 ----
static void handle_translate(SOCKET s, const char* path, const char* body, int blen) {
    JVal* req;
    ReloadFromIni();
    req = json_parse(body, blen);
    SBuf out;
    const char* srcLang, *tgtLang, *backupLang;
    char so[32], to[32];

    sb_init(&out);
    if (!req || req->t != JOBJ) {
        sb_str(&out, "{\"result\":\"\",\"translatedText\":\"\"}");
        http_reply(s, 200, "application/json; charset=utf-8", out.p, out.len);
        free(out.p); json_free(req);
        return;
    }

    srcLang    = json_str(json_get(req, "sourceLang"));
    tgtLang    = json_str(json_get(req, "targetLang"));
    backupLang = json_str(json_get(req, "backupLang"));

    if (strstr(path, "/translate/image")) {
        JVal* blocks = json_get(req, "blocks");
        int i;
        sb_str(&out, "{\"version\":\"v3\",\"srcLang\":");
        sb_esc(&out, srcLang ? srcLang : "auto");
        sb_str(&out, ",\"dstLang\":");
        sb_esc(&out, tgtLang ? tgtLang : "zh-cn");
        sb_str(&out, ",\"blocks\":[");
        for (i = 0; blocks && i < blocks->n; i++) {
            JVal* b = blocks->items[i];
            const char* bid = json_str(json_get(b, "id"));
            const char* btype = json_str(json_get(b, "type"));
            const char* btxt = json_str(json_get(b, "text"));
            char* tt = NULL;
            if (i) sb_str(&out, ",");
            if (btxt && *btxt) {
                eff_langs(srcLang, tgtLang, backupLang, btxt, so, sizeof(so), to, sizeof(to));
                tt = llm_translate(btxt, so, to, &g_cfg);
                sb_str(&out, "{\"id\":"); sb_esc(&out, bid ? bid : "");
                sb_str(&out, ",\"type\":"); sb_esc(&out, btype ? btype : "text");
                sb_str(&out, ",\"status\":\"ok\",\"sourceText\":"); sb_esc(&out, btxt);
                sb_str(&out, ",\"translatedText\":"); sb_esc(&out, tt ? tt : "[翻译失败: 请检查API Key或额度]");
                sb_str(&out, "}");
                if (tt) free(tt);
            } else {
                sb_str(&out, "{\"id\":"); sb_esc(&out, bid ? bid : "");
                sb_str(&out, ",\"type\":"); sb_esc(&out, btype ? btype : "text");
                sb_str(&out, ",\"status\":\"error\",\"errorMessage\":\"no text\"}");
            }
        }
        sb_str(&out, "]}");
    } else {
        /* 文本翻译: sourceText 可能是字符串或数组 */
        JVal* st = json_get(req, "sourceText");
        if (!st) st = json_get(req, "text");
        {
            int i, count = 1;
            if (st && st->t == JARR) count = st->n;
            for (i = 0; i < count; i++) {
                const char* txt = NULL;
                char* tt = NULL;
                if (st && st->t == JARR) {
                    JVal* e = st->items[i];
                    txt = (e && e->t == JSTR) ? e->str : json_str(json_get(e, "text"));
                } else if (st && st->t == JSTR) {
                    txt = st->str;
                } else if (st && st->t == JOBJ) {
                    txt = json_str(json_get(st, "text"));
                }
                if (!txt || !*txt) continue;
                eff_langs(srcLang, tgtLang, backupLang, txt, so, sizeof(so), to, sizeof(to));
                tt = llm_translate(txt, so, to, &g_cfg);
                sb_str(&out, "{\"result\":");
                sb_esc(&out, tt ? tt : "[翻译失败: 请检查API Key或额度]");
                sb_str(&out, ",\"translatedText\":");
                sb_esc(&out, tt ? tt : "[翻译失败: 请检查API Key或额度]");
                sb_str(&out, ",\"sourceText\":"); sb_esc(&out, txt);
                sb_str(&out, ",\"sourceLang\":"); sb_esc(&out, srcLang ? srcLang : "auto");
                sb_str(&out, ",\"targetLang\":"); sb_esc(&out, tgtLang ? tgtLang : "zh-cn");
                sb_str(&out, "}");
                if (tt) free(tt);
                break;   /* 项目L 一次只取第一个 */
            }
            if (out.len == 0) sb_str(&out, "{\"result\":\"\",\"translatedText\":\"\"}");
        }
    }

    HookLog("bridge: translate done (%d bytes)", out.len);
    http_reply(s, 200, "application/json; charset=utf-8", out.p, out.len);
    free(out.p);
    json_free(req);
}

// ---- 非翻译请求: 透明回源 ----
static void handle_forward(SOCKET s, const char* method, const char* path,
                           const char* headers, const char* body, int blen)
{
    SBuf url, hdr;
    HttpResp resp;
    char host[128];
    const char* up = g_cfg.upstreamHost[0] ? g_cfg.upstreamHost : "api.项目L.cn";
    strncpy(host, up, sizeof(host) - 1); host[sizeof(host)-1] = 0;

    sb_init(&url);
    sb_str(&url, "https://");
    sb_str(&url, host);
    sb_str(&url, path);

    sb_init(&hdr);
    {
        const char* p = headers;
        while (p && *p) {
            const char* e = strstr(p, "\r\n");
            int ln = e ? (int)(e - p) : (int)strlen(p);
            if (ln == 0) break; // 空行即为 HTTP 头部与 Body 的分界线，必须停止！
            if (strncmp(p, "Host:", 5) && strncmp(p, "host:", 5) &&
                strncmp(p, "Content-Length:", 15) && strncmp(p, "content-length:", 15) &&
                strncmp(p, "Connection:", 11) && strncmp(p, "connection:", 11) &&
                strncmp(p, "Accept-Encoding:", 16) && strncmp(p, "accept-encoding:", 16)) {
                sb_raw(&hdr, p, ln);
                sb_str(&hdr, "\r\n");
            }
            if (!e) break;
            p = e + 2;
        }
    }

    if (http_request(method, url.p, hdr.p, body, blen, &resp, 90000)) {
        char rh[256];
        int n = sprintf(rh,
            "HTTP/1.1 %d OK\r\n"
            "Content-Type: application/json; charset=utf-8\r\n"
            "Content-Length: %d\r\n"
            "Connection: close\r\n\r\n", resp.status, resp.len);
        send_all(s, rh, n);
        if (resp.len > 0) send_all(s, resp.data, resp.len);
        free(resp.data);
    } else {
        const char* e = "{\"error\":\"bridge upstream fail\"}";
        http_reply(s, 502, "application/json", e, (int)strlen(e));
    }
    free(url.p);
    free(hdr.p);
}

// ---- 单连接处理 ----
static DWORD WINAPI ConnThread(LPVOID param)
{
    SOCKET s = (SOCKET)(INT_PTR)param;
    char* buf = NULL;
    int cap = 65536, len = 0;
    int hdrEnd = -1, i;
    int contentLen = 0;
    char method[16] = {0}, path[2048] = {0};

    buf = (char*)malloc(cap);
    for (;;) {
        int n;
        if (len + 4096 > cap) { cap *= 2; buf = (char*)realloc(buf, cap); }
        n = recv(s, buf + len, cap - len - 1, 0);
        if (n <= 0) break;
        len += n;
        buf[len] = 0;
        if (hdrEnd < 0) {
            char* p = strstr(buf, "\r\n\r\n");
            if (p) {
                hdrEnd = (int)(p - buf) + 4;
                {
                    char* cl = strstr(buf, "Content-Length:");
                    if (!cl) cl = strstr(buf, "content-length:");
                    if (cl) contentLen = atoi(cl + 15);
                }
            }
        }
        if (hdrEnd >= 0 && len - hdrEnd >= contentLen) break;
        if (len > BRIDGE_MAX_BODY) break;
    }

    if (len > 0 && hdrEnd > 0) {
        sscanf(buf, "%15s %2047s", method, path);
        {
            char* hdrs = buf;
            char* hp = strstr(hdrs, "\r\n");
            char* body = buf + hdrEnd;
            int blen = len - hdrEnd;
            if (blen < 0) blen = 0;
            if (hp) hp += 2; else hp = hdrs;
            ReloadFromIni();
            HookLog("bridge: [HTTP] %s %s (body=%d)", method, path, blen);
            if (strstr(path, "/translate/")) {
                if (g_cfg.llmUrl[0]) {
                    handle_translate(s, path, body, blen);
                } else {
                    handle_forward(s, method, path, hp, body, blen);
                }
            } else if (strstr(path, "/healthz")) {
                http_reply(s, 200, "text/plain", "ok", 2);
            } else {
                handle_forward(s, method, path, hp, body, blen);
            }
        }
    }
    free(buf);
    closesocket(s);
    return 0;
}

// ---- 监听线程 ----
static DWORD WINAPI AcceptThread(LPVOID param)
{
    (void)param;
    while (!g_stop) {
        SOCKET c = accept(g_listen, NULL, NULL);
        if (c == INVALID_SOCKET) {
            if (g_stop) break;
            Sleep(50);
            continue;
        }
        {
            HANDLE h = CreateThread(NULL, 0, ConnThread, (LPVOID)(INT_PTR)c, 0, NULL);
            if (h) CloseHandle(h); else closesocket(c);
        }
    }
    return 0;
}

int BridgeStart(const BridgeConfig* cfg)
{
    WSADATA wsa;
    struct sockaddr_in addr;
    int port;

    if (g_listen != INVALID_SOCKET) return g_port;

    memcpy(&g_cfg, cfg, sizeof(g_cfg));
    if (!g_cfg.upstreamHost[0]) strcpy(g_cfg.upstreamHost, "api.项目L.cn");

    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        HookLog("bridge: WSAStartup failed");
        return 0;
    }

    for (port = BRIDGE_DEFAULT_PORT; port < BRIDGE_DEFAULT_PORT + 20; port++) {
        SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        BOOL yes = TRUE;
        if (s == INVALID_SOCKET) continue;
        /* Windows 下 SO_REUSEADDR 允许重复绑定, 会导致多实例互相抢请求;
           改用 SO_EXCLUSIVEADDRUSE 保证独占, 端口被占则自动顺延 */
        setsockopt(s, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (const char*)&yes, sizeof(yes));
        memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");
        addr.sin_port = htons((u_short)port);
        if (bind(s, (struct sockaddr*)&addr, sizeof(addr)) == 0 && listen(s, 32) == 0) {
            g_listen = s;
            g_port = port;
            break;
        }
        closesocket(s);
    }

    if (g_listen == INVALID_SOCKET) {
        HookLog("bridge: no free port in %d..%d", BRIDGE_DEFAULT_PORT, BRIDGE_DEFAULT_PORT + 19);
        return 0;
    }

    g_stop = 0;
    g_hAccept = CreateThread(NULL, 0, AcceptThread, NULL, 0, NULL);
    HookLog("bridge: listening on http://127.0.0.1:%d  (llm=%s)", g_port, g_cfg.llmUrl);
    return g_port;
}

void BridgeStop(void)
{
    g_stop = 1;
    if (g_listen != INVALID_SOCKET) { closesocket(g_listen); g_listen = INVALID_SOCKET; }
    if (g_hAccept) { CloseHandle(g_hAccept); g_hAccept = NULL; }
    g_port = 0;
}

int BridgePort(void) { return g_port; }

void BridgeSetTimeout(int ms) { if (ms > 1000) g_llmTimeoutMs = ms; }

void BridgeUpdateConfig(const BridgeConfig* cfg)
{
    memcpy(&g_cfg, cfg, sizeof(g_cfg));
    if (!g_cfg.upstreamHost[0]) strcpy(g_cfg.upstreamHost, "api.项目L.cn");
    HookLog("bridge: config updated (llm=%s key=%s model=%s style=%d)",
            g_cfg.llmUrl, g_cfg.llmKey[0] ? "<set>" : "<empty>",
            g_cfg.llmModel, g_cfg.llmStyle);
}

