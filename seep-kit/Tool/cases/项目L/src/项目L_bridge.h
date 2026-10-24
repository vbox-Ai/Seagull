// 项目L_bridge.h —— 项目L 内嵌本地翻译网关
#ifndef PROJECTL_BRIDGE_H
#define PROJECTL_BRIDGE_H

#ifdef __cplusplus
extern "C" {
#endif

// 日志 (由 hook.c 提供)
void HookLog(const char* fmt, ...);

typedef struct {
    char llmUrl[1024];      // 大模型接口地址
    char llmKey[512];       // 大模型 API Key
    char llmModel[128];     // 可选, 覆盖模型名
    int  llmStyle;          // 0=auto 1=openai 2=gemini 3=anthropic
    char upstreamHost[128]; // 非翻译请求回源主机
    char iniPath[260];      // 配置文件名 (用于每次请求前热重读)
} BridgeConfig;

// 启动本地网关, 返回监听端口 (>0), 失败返回 0
int  BridgeStart(const BridgeConfig* cfg);
void BridgeStop(void);
int  BridgePort(void);
void BridgeUpdateConfig(const BridgeConfig* cfg);
void BridgeSetTimeout(int ms);   // 调整大模型请求超时

// 供 hook.c 调用
char* llm_translate(const char* text, const char* srcLang, const char* tgtLang,
                    const BridgeConfig* cfg);

#ifdef __cplusplus
}
#endif
#endif
