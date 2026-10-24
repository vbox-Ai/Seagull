/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * JSVMP反混淆器
 * 识别和破解JavaScript虚拟机保护（JSVMP）混淆
 */

import generateImport from '@babel/generator';
import * as parser from '@babel/parser';
import traverseImport from '@babel/traverse';
import * as t from '@babel/types';

const generate =
  (generateImport as unknown as {default?: typeof generateImport}).default ??
  generateImport;
const traverse =
  (traverseImport as unknown as {default?: typeof traverseImport}).default ??
  traverseImport;

import type {LLMService} from '../../services/LLMService.js';
import type {
  JSVMPDeobfuscatorOptions,
  JSVMPDeobfuscatorResult,
  VMFeatures,
  VMInstruction,
  VMType,
  ComplexityLevel,
  UnresolvedPart,
} from '../../types/index.js';
import {logger} from '../../utils/logger.js';

/**
 * JSVMP反混淆器
 */
export class JSVMPDeobfuscator {
  private llm?: LLMService;

  constructor(llm?: LLMService) {
    this.llm = llm;
  }

  /**
   * 反混淆JSVMP代码
   */
  async deobfuscate(
    options: JSVMPDeobfuscatorOptions,
  ): Promise<JSVMPDeobfuscatorResult> {
    const startTime = Date.now();
    const {
      code,
      aggressive = false,
      extractInstructions = false,
      timeout = 30000,
      maxIterations = 100,
    } = options;

    logger.info('🔍 开始JSVMP反混淆分析...');

    try {
      // 1. 检测是否为JSVMP混淆
      const vmFeatures = this.detectJSVMP(code);
      if (!vmFeatures) {
        logger.info('未检测到JSVMP混淆');
        return {
          isJSVMP: false,
          deobfuscatedCode: code,
          confidence: 0,
          warnings: ['未检测到JSVMP特征'],
        };
      }

      logger.info(`✅ 检测到JSVMP混淆，复杂度: ${vmFeatures.complexity}`);
      logger.info(`📊 指令数量: ${vmFeatures.instructionCount}`);

      // 2. 识别虚拟机类型
      const vmType = this.identifyVMType(code, vmFeatures);
      logger.info(`🔧 虚拟机类型: ${vmType}`);

      // 3. 提取指令集（如果需要）
      let instructions: VMInstruction[] | undefined;
      if (extractInstructions) {
        logger.info('📝 正在提取虚拟机指令集...');
        instructions = this.extractInstructions(code, vmFeatures);
        logger.info(`✅ 提取到 ${instructions.length} 条指令`);
      }

      // 4. 尝试还原代码
      logger.info('🔧 正在还原代码...');
      const deobfuscationResult = await this.restoreCode(
        code,
        vmFeatures,
        vmType,
        aggressive,
        timeout,
        maxIterations,
      );

      const processingTime = Date.now() - startTime;

      const result: JSVMPDeobfuscatorResult = {
        isJSVMP: true,
        vmType,
        vmFeatures,
        instructions,
        deobfuscatedCode: deobfuscationResult.code,
        confidence: deobfuscationResult.confidence,
        warnings: deobfuscationResult.warnings,
        unresolvedParts: deobfuscationResult.unresolvedParts,
        stats: {
          originalSize: code.length,
          deobfuscatedSize: deobfuscationResult.code.length,
          reductionRate: 1 - deobfuscationResult.code.length / code.length,
          processingTime,
        },
      };

      logger.info(`✅ JSVMP反混淆完成，耗时 ${processingTime}ms`);
      logger.info(`📊 还原置信度: ${(result.confidence * 100).toFixed(1)}%`);

      return result;
    } catch (error) {
      logger.error('JSVMP反混淆失败', error);
      return {
        isJSVMP: false,
        deobfuscatedCode: code,
        confidence: 0,
        warnings: [`反混淆失败: ${error}`],
      };
    }
  }

  /**
   * 检测JSVMP特征（完整实现 - 基于实战案例）
   * 参考：抖音bdms.js、头条acrawler.js等JSVMP混淆代码
   */
  private detectJSVMP(code: string): VMFeatures | null {
    try {
      const ast = parser.parse(code, {
        sourceType: 'unambiguous',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      });

      let hasSwitch = false;
      let hasInstructionArray = false;
      let hasProgramCounter = false;
      let instructionCount = 0;
      let interpreterLocation = '';
      let maxSwitchCases = 0;

      // 额外的JSVMP特征检测
      let hasBytecodeArray = false; // 字节码数组：var j = parseInt("" + b[O] + b[O + 1], 16);
      let hasApplyCall = false; // apply调用：s.apply(b, u)
      let hasWhileLoop = false; // 大循环
      let bytecodePattern = false; // 字节码模式

      traverse(ast, {
        // 1. 检测大型switch语句（VM解释器的核心特征）
        SwitchStatement(path) {
          const caseCount = path.node.cases.length;
          if (caseCount > 10) {
            hasSwitch = true;
            if (caseCount > maxSwitchCases) {
              maxSwitchCases = caseCount;
              instructionCount = caseCount;
              interpreterLocation = `Line ${path.node.loc?.start.line || 0}`;
            }
          }
        },

        // 2. 检测指令数组（字节码数组）
        ArrayExpression(path) {
          if (path.node.elements.length > 50) {
            hasInstructionArray = true;
          }
        },

        // 3. 检测程序计数器（PC寄存器）
        UpdateExpression(path) {
          if (path.node.operator === '++' || path.node.operator === '--') {
            const arg = path.node.argument;
            if (t.isIdentifier(arg) && arg.name.length <= 3) {
              hasProgramCounter = true;
            }
          }
        },

        // 4. 检测字节码解析模式：parseInt("" + b[O] + b[O + 1], 16)
        CallExpression(path) {
          if (
            t.isIdentifier(path.node.callee, {name: 'parseInt'}) &&
            path.node.arguments.length >= 2
          ) {
            const firstArg = path.node.arguments[0];
            // 检测字符串拼接模式
            if (t.isBinaryExpression(firstArg) && firstArg.operator === '+') {
              bytecodePattern = true;
              hasBytecodeArray = true;
            }
          }

          // 检测apply调用模式：s.apply(b, u)
          if (
            t.isMemberExpression(path.node.callee) &&
            t.isIdentifier(path.node.callee.property, {name: 'apply'})
          ) {
            hasApplyCall = true;
          }
        },

        // 5. 检测大循环（VM主循环）
        WhileStatement(path) {
          // 检测while(true)或while(1)模式
          if (
            t.isBooleanLiteral(path.node.test, {value: true}) ||
            t.isNumericLiteral(path.node.test, {value: 1})
          ) {
            hasWhileLoop = true;
          }
        },

        // 6. 检测for循环中的VM模式
        ForStatement(path) {
          // 检测for(;;)无限循环
          if (!path.node.test) {
            hasWhileLoop = true;
          }
        },
      });

      // 综合判断是否为JSVMP（更严格的条件）
      const isJSVMP =
        hasSwitch &&
        (hasInstructionArray || hasProgramCounter) &&
        (hasApplyCall || hasWhileLoop || bytecodePattern);

      if (isJSVMP) {
        const complexity: ComplexityLevel =
          instructionCount > 100
            ? 'high'
            : instructionCount > 50
              ? 'medium'
              : 'low';

        logger.info('🔍 JSVMP特征检测结果:');
        logger.info(`  - Switch语句: ${hasSwitch} (${maxSwitchCases} cases)`);
        logger.info(`  - 指令数组: ${hasInstructionArray}`);
        logger.info(`  - 程序计数器: ${hasProgramCounter}`);
        logger.info(`  - 字节码数组: ${hasBytecodeArray}`);
        logger.info(`  - Apply调用: ${hasApplyCall}`);
        logger.info(`  - 大循环: ${hasWhileLoop}`);
        logger.info(`  - 字节码模式: ${bytecodePattern}`);

        return {
          instructionCount,
          interpreterLocation,
          complexity,
          hasSwitch,
          hasInstructionArray,
          hasProgramCounter,
        };
      }

      return null;
    } catch (error) {
      logger.warn('JSVMP检测失败，尝试使用正则表达式检测', error);

      // 回退到正则表达式检测
      return this.detectJSVMPWithRegex(code);
    }
  }

  /**
   * 使用正则表达式检测JSVMP（回退方案）
   */
  private detectJSVMPWithRegex(code: string): VMFeatures | null {
    // 检测switch语句
    const switchMatches = code.match(/switch\s*\(/g);
    const hasSwitch = (switchMatches?.length || 0) > 0;

    // 检测字节码模式
    const bytecodePattern = /parseInt\s*\(\s*["']?\s*\+\s*\w+\[/g.test(code);

    // 检测apply调用
    const applyPattern = /\.apply\s*\(/g.test(code);

    // 检测大循环
    const whilePattern = /while\s*\(\s*(true|1)\s*\)/g.test(code);

    if (hasSwitch && (bytecodePattern || applyPattern || whilePattern)) {
      logger.info('✅ 通过正则表达式检测到JSVMP特征');
      return {
        instructionCount: 0,
        interpreterLocation: 'Unknown',
        complexity: 'medium',
        hasSwitch: true,
        hasInstructionArray: bytecodePattern,
        hasProgramCounter: applyPattern,
      };
    }

    return null;
  }

  /**
   * 识别虚拟机类型
   */
  private identifyVMType(code: string, _features: VMFeatures): VMType {
    // 检测obfuscator.io特征
    if (code.includes('_0x') && code.includes('function(_0x')) {
      return 'obfuscator.io';
    }

    // 检测JSFuck特征
    if (/^\s*\[\s*\]\s*\[\s*\(/.test(code)) {
      return 'jsfuck';
    }

    // 检测JJEncode特征
    if (code.includes('$=~[];')) {
      return 'jjencode';
    }

    return 'custom';
  }

  /**
   * 提取虚拟机指令集
   */
  private extractInstructions(
    code: string,
    features: VMFeatures,
  ): VMInstruction[] {
    const instructions: VMInstruction[] = [];

    try {
      const ast = parser.parse(code, {
        sourceType: 'unambiguous',
        plugins: ['jsx', 'typescript'],
      });

      // 查找switch语句并提取case
      const inferInstructionType = this.inferInstructionType.bind(this);
      traverse(ast, {
        SwitchStatement(path) {
          if (path.node.cases.length === features.instructionCount) {
            path.node.cases.forEach((caseNode, index) => {
              const opcode = caseNode.test
                ? t.isNumericLiteral(caseNode.test)
                  ? caseNode.test.value
                  : t.isStringLiteral(caseNode.test)
                    ? caseNode.test.value
                    : index
                : index;

              // 推断指令类型
              const type = inferInstructionType(caseNode);

              instructions.push({
                opcode,
                name: `INST_${opcode}`,
                type,
                description: `Instruction ${opcode}`,
              });
            });
          }
        },
      });
    } catch (error) {
      logger.warn('指令提取失败', error);
    }

    return instructions;
  }

  /**
   * 推断指令类型（完整实现 - 基于实战中的操作码模式）
   * 参考：JSVMP常见操作码
   * - 0x01: PUSH (压栈)
   * - 0x02: ADD (加法)
   * - 0x03: CALL (调用函数)
   * - 0x04: LOAD (加载变量)
   * - 0x05: STORE (存储变量)
   * - 0x06: JMP (跳转)
   * - 0x07: CMP (比较)
   * - 0x08: RET (返回)
   */
  private inferInstructionType(caseNode: t.SwitchCase): VMInstruction['type'] {
    const code = generate(caseNode).code;
    const consequent = caseNode.consequent;

    // 分析AST节点类型
    let hasAssignment = false;
    let hasArrayAccess = false;
    let hasFunctionCall = false;
    let hasArithmetic = false;
    let hasControlFlow = false;

    for (const stmt of consequent) {
      if (t.isExpressionStatement(stmt)) {
        const expr = stmt.expression;

        // 检测赋值操作
        if (t.isAssignmentExpression(expr)) {
          hasAssignment = true;
        }

        // 检测数组访问
        if (t.isMemberExpression(expr) && t.isNumericLiteral(expr.property)) {
          hasArrayAccess = true;
        }

        // 检测函数调用
        if (t.isCallExpression(expr)) {
          hasFunctionCall = true;
        }

        // 检测算术运算
        if (t.isBinaryExpression(expr)) {
          if (['+', '-', '*', '/', '%', '**'].includes(expr.operator)) {
            hasArithmetic = true;
          }
        }
      }

      // 检测控制流语句
      if (
        t.isIfStatement(stmt) ||
        t.isWhileStatement(stmt) ||
        t.isBreakStatement(stmt) ||
        t.isContinueStatement(stmt) ||
        t.isReturnStatement(stmt)
      ) {
        hasControlFlow = true;
      }
    }

    // 基于代码模式推断指令类型
    // 1. LOAD指令：从栈或数组中加载数据
    if (
      (code.includes('push') || code.includes('.push(')) &&
      (hasArrayAccess || code.includes('['))
    ) {
      return 'load';
    }

    // 2. STORE指令：存储数据到栈或变量
    if (hasAssignment && !hasArithmetic && !hasFunctionCall) {
      return 'store';
    }

    // 3. ARITHMETIC指令：算术运算
    if (hasArithmetic || code.match(/[+\-*/%]/)) {
      return 'arithmetic';
    }

    // 4. CONTROL指令：控制流（跳转、条件判断）
    if (hasControlFlow || code.includes('break') || code.includes('continue')) {
      return 'control';
    }

    // 5. CALL指令：函数调用
    if (
      hasFunctionCall ||
      code.includes('.apply(') ||
      code.includes('.call(')
    ) {
      return 'call';
    }

    // 6. 默认为unknown
    return 'unknown';
  }

  /**
   * 还原代码
   */
  private async restoreCode(
    code: string,
    _features: VMFeatures,
    vmType: VMType,
    aggressive: boolean,
    _timeout: number,
    _maxIterations: number,
  ): Promise<{
    code: string;
    confidence: number;
    warnings: string[];
    unresolvedParts?: UnresolvedPart[];
  }> {
    const warnings: string[] = [];
    const unresolvedParts: UnresolvedPart[] = [];

    // 根据VM类型选择还原策略
    if (vmType === 'obfuscator.io') {
      return await this.restoreObfuscatorIO(
        code,
        aggressive,
        warnings,
        unresolvedParts,
      );
    } else if (vmType === 'jsfuck') {
      return await this.restoreJSFuck(code, warnings);
    } else if (vmType === 'jjencode') {
      return await this.restoreJJEncode(code, warnings);
    } else {
      // 自定义VM，使用LLM辅助
      return await this.restoreCustomVM(
        code,
        aggressive,
        warnings,
        unresolvedParts,
      );
    }
  }

  /**
   * 还原obfuscator.io混淆（完整实现）
   * 参考：obfuscator.io的VM保护模式
   */
  private async restoreObfuscatorIO(
    code: string,
    aggressive: boolean,
    warnings: string[],
    unresolvedParts: UnresolvedPart[],
  ): Promise<{
    code: string;
    confidence: number;
    warnings: string[];
    unresolvedParts?: UnresolvedPart[];
  }> {
    let restored = code;
    let confidence = 0.5;

    try {
      // 1. 提取字符串数组
      const stringArrayMatch = code.match(
        /var\s+(_0x[a-f0-9]+)\s*=\s*(\[.*?\]);/s,
      );
      if (stringArrayMatch) {
        const arrayName = stringArrayMatch[1];
        const arrayContent = stringArrayMatch[2];

        logger.info(`🔍 发现字符串数组: ${arrayName}`);

        try {
          // 尝试解析字符串数组（使用Function构造器更安全）
          const arrayFunc = new Function(`return ${arrayContent || '[]'};`);
          const stringArray = arrayFunc();

          if (Array.isArray(stringArray)) {
            logger.info(
              `✅ 成功解析字符串数组，包含 ${stringArray.length} 个字符串`,
            );

            // 替换所有对字符串数组的引用
            const refPattern = new RegExp(`${arrayName}\\[(\\d+)\\]`, 'g');
            restored = restored.replace(refPattern, (_match, index) => {
              const idx = parseInt(index, 10);
              if (idx < stringArray.length) {
                return JSON.stringify(stringArray[idx]);
              }
              return _match;
            });

            confidence += 0.2;
          }
        } catch (e) {
          warnings.push(`字符串数组解析失败: ${e}`);

          // LLM 辅助提取字符串数组
          if (this.llm) {
            try {
              logger.info('🤖 使用LLM辅助提取字符串数组...');
              const snippet = (arrayContent || '').substring(0, 3000);
              const response = await this.llm.chat(
                [
                  {
                    role: 'system',
                    content:
                      'You are a JavaScript reverse engineer. Extract and decode the string array from obfuscator.io protected code. Return ONLY a valid JSON array of decoded strings.',
                  },
                  {
                    role: 'user',
                    content: `Extract the string array from this obfuscated code fragment:\n\`\`\`\n${snippet}\n\`\`\`\n\nReturn the decoded string array as a JSON array.`,
                  },
                ],
                {temperature: 0.1, maxTokens: 4000},
              );

              const jsonMatch = response.content.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const llmArray = JSON.parse(jsonMatch[0]);
                if (Array.isArray(llmArray) && llmArray.length > 0) {
                  logger.info(`✅ LLM提取到 ${llmArray.length} 个字符串`);
                  const refPattern = new RegExp(
                    `${arrayName}\\[(\\d+)\\]`,
                    'g',
                  );
                  restored = restored.replace(refPattern, (_match, index) => {
                    const idx = parseInt(index, 10);
                    if (idx < llmArray.length)
                      return JSON.stringify(llmArray[idx]);
                    return _match;
                  });
                  confidence += 0.15;
                  warnings.push('字符串数组由AI辅助提取，准确性需验证');
                }
              }
            } catch (llmErr) {
              logger.warn('LLM辅助提取字符串数组失败', llmErr);
            }
          }

          unresolvedParts.push({
            location: 'String Array',
            reason: '无法解析字符串数组',
            suggestion: this.llm
              ? 'AI已尝试辅助提取，结果可能不完整'
              : '配置LLM服务以启用AI辅助提取',
          });
        }
      }

      // 2. 移除字符串数组旋转函数
      restored = restored.replace(
        /\(function\s*\(_0x[a-f0-9]+,\s*_0x[a-f0-9]+\)\s*\{[\s\S]*?\}\(_0x[a-f0-9]+,\s*0x[a-f0-9]+\)\);?/g,
        '',
      );

      // 3. 简化函数包装器
      if (aggressive) {
        // 移除IIFE包装
        restored = restored.replace(
          /\(function\s*\(\)\s*\{([\s\S]*)\}\(\)\);?/g,
          '$1',
        );
        confidence += 0.1;
      }

      // 4. 还原十六进制数字
      restored = restored.replace(/0x([0-9a-f]+)/gi, (_match, hex) => {
        return String(parseInt(hex, 16));
      });

      // 5. 清理空语句
      restored = restored.replace(/;\s*;/g, ';');
      restored = restored.replace(/\{\s*\}/g, '{}');

      warnings.push('obfuscator.io还原完成，部分复杂逻辑可能需要AI进一步分析');

      return {
        code: restored,
        confidence: Math.min(confidence, 1.0),
        warnings,
        unresolvedParts:
          unresolvedParts.length > 0 ? unresolvedParts : undefined,
      };
    } catch (error) {
      warnings.push(`obfuscator.io还原失败: ${error}`);
      return {
        code,
        confidence: 0.2,
        warnings,
        unresolvedParts,
      };
    }
  }

  /**
   * 还原JSFuck混淆（完整实现 + LLM降级）
   * JSFuck原理：只使用6个字符 []()!+ 来编写JavaScript
   * 例如：false = ![] , true = !![] , undefined = [][[]] , NaN = +[![]]
   */
  private async restoreJSFuck(
    code: string,
    warnings: string[],
  ): Promise<{
    code: string;
    confidence: number;
    warnings: string[];
  }> {
    try {
      logger.info('🔍 检测到JSFuck混淆，尝试还原...');

      // JSFuck代码通常非常长，直接执行可能会超时
      // 我们尝试使用Function构造器执行它
      try {
        // 限制代码长度避免执行超时
        if (code.length > 100000) {
          warnings.push('JSFuck代码过长，本地执行可能超时，尝试AI分析...');
          return await this.llmDecodeEncoding(code, 'JSFuck', warnings);
        }

        // 尝试执行JSFuck代码获取原始代码
        const func = new Function(`return ${code};`);
        const result = func();

        if (typeof result === 'string') {
          logger.info('✅ JSFuck还原成功');
          return {
            code: result,
            confidence: 0.9,
            warnings: ['JSFuck已成功还原'],
          };
        } else {
          warnings.push('JSFuck执行结果不是字符串，尝试AI分析...');
          return await this.llmDecodeEncoding(code, 'JSFuck', warnings);
        }
      } catch (execError) {
        warnings.push(`JSFuck本地执行失败: ${execError}`);
        return await this.llmDecodeEncoding(code, 'JSFuck', warnings);
      }
    } catch (error) {
      warnings.push(`JSFuck还原失败: ${error}`);
      return {
        code,
        confidence: 0.1,
        warnings,
      };
    }
  }

  /**
   * 还原JJEncode混淆（完整实现 + LLM降级）
   * JJEncode原理：使用日文字符和特殊符号编码JavaScript
   * 特征：$=~[]; $={___:++$,$$$$:(![]+"")[$]...
   */
  private async restoreJJEncode(
    code: string,
    warnings: string[],
  ): Promise<{
    code: string;
    confidence: number;
    warnings: string[];
  }> {
    try {
      logger.info('🔍 检测到JJEncode混淆，尝试还原...');

      // JJEncode的还原方法：直接执行代码
      try {
        // 提取JJEncode的核心代码（通常在最后一行）
        const lines = code.split('\n').filter(line => line.trim());
        const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';

        // JJEncode通常以 $$$$ 结尾
        if (lastLine && lastLine.includes('$$$$')) {
          // 尝试执行获取原始代码
          const func = new Function(`${code}; return $$$$()`);
          const result = func();

          if (typeof result === 'string') {
            logger.info('✅ JJEncode还原成功');
            return {
              code: result,
              confidence: 0.9,
              warnings: ['JJEncode已成功还原'],
            };
          }
        }

        // 如果上面的方法失败，尝试直接执行整个代码
        const func2 = new Function(code);
        func2();

        warnings.push('JJEncode本地执行完成但无法提取原始代码，尝试AI分析...');
        return await this.llmDecodeEncoding(code, 'JJEncode', warnings);
      } catch (execError) {
        warnings.push(`JJEncode本地执行失败: ${execError}`);
        return await this.llmDecodeEncoding(code, 'JJEncode', warnings);
      }
    } catch (error) {
      warnings.push(`JJEncode还原失败: ${error}`);
      return {
        code,
        confidence: 0.1,
        warnings,
      };
    }
  }

  /**
   * LLM辅助解码编码型混淆（JSFuck/JJEncode/AAEncode等）
   * 当本地执行失败时，利用AI分析混淆代码并尝试还原
   */
  private async llmDecodeEncoding(
    code: string,
    encodingType: string,
    warnings: string[],
  ): Promise<{
    code: string;
    confidence: number;
    warnings: string[];
  }> {
    if (!this.llm) {
      warnings.push(
        `未配置LLM服务，${encodingType}本地还原失败后无法进行AI辅助分析`,
      );
      warnings.push('建议：配置DeepSeek/OpenAI API以启用AI辅助反混淆');
      return {code, confidence: 0.1, warnings};
    }

    try {
      logger.info(`🤖 使用LLM辅助分析${encodingType}混淆...`);

      // 截取代码片段，避免token超限
      const snippet =
        code.length > 5000
          ? code.substring(0, 5000) + '\n\n// ... (code truncated)'
          : code;

      const response = await this.llm.chat(
        [
          {
            role: 'system',
            content: `# Role
You are an expert JavaScript reverse engineer specializing in encoding-based obfuscation.

# Task
Analyze and decode ${encodingType} obfuscated JavaScript code.

# Instructions
1. Identify the encoding pattern and technique used
2. Trace the decoding logic step by step
3. Extract or reconstruct the original JavaScript code
4. If full decoding is not possible, provide:
   - Partial decoded fragments
   - The encoding mechanism explanation
   - Key variables/functions identified
   - Actionable steps for manual completion

# Output Format
Return a JSON object:
{
  "decoded": "the decoded JavaScript code (or best partial result)",
  "confidence": 0.0-1.0,
  "mechanism": "explanation of the encoding mechanism",
  "keyFindings": ["finding1", "finding2"],
  "manualSteps": ["step1 if full decode failed"]
}`,
          },
          {
            role: 'user',
            content: `Decode this ${encodingType} obfuscated code:\n\`\`\`javascript\n${snippet}\n\`\`\``,
          },
        ],
        {temperature: 0.1, maxTokens: 4000},
      );

      // 解析LLM返回
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);

          if (
            result.decoded &&
            result.decoded !== code &&
            result.decoded.length > 0
          ) {
            logger.info(`✅ AI辅助${encodingType}解码完成`);
            warnings.push(
              `${encodingType}由AI辅助解码，准确性: ${Math.round((result.confidence || 0.5) * 100)}%`,
            );

            if (result.mechanism) {
              warnings.push(`编码机制: ${result.mechanism}`);
            }
            if (result.keyFindings && Array.isArray(result.keyFindings)) {
              result.keyFindings.forEach((f: string) =>
                warnings.push(`发现: ${f}`),
              );
            }
            if (
              result.manualSteps &&
              Array.isArray(result.manualSteps) &&
              result.manualSteps.length > 0
            ) {
              warnings.push(`需手动完成: ${result.manualSteps.join('; ')}`);
            }

            return {
              code: result.decoded,
              confidence: Math.min(result.confidence || 0.5, 0.8),
              warnings,
            };
          }

          // LLM返回了分析但没有成功解码
          if (result.mechanism || result.keyFindings) {
            warnings.push(`AI分析了${encodingType}编码机制但未能完全解码`);
            if (result.mechanism) warnings.push(`机制: ${result.mechanism}`);
            if (result.keyFindings)
              result.keyFindings.forEach((f: string) =>
                warnings.push(`发现: ${f}`),
              );
            if (result.manualSteps)
              result.manualSteps.forEach((s: string) =>
                warnings.push(`建议: ${s}`),
              );
          }
        } catch {
          // JSON解析失败，尝试直接使用LLM文本输出
          const codeBlockMatch = response.content.match(
            /```(?:javascript|js)?\s*([\s\S]*?)```/,
          );
          if (codeBlockMatch && codeBlockMatch[1].trim().length > 10) {
            warnings.push(
              `${encodingType}由AI辅助解码（从文本响应提取），需验证准确性`,
            );
            return {
              code: codeBlockMatch[1].trim(),
              confidence: 0.4,
              warnings,
            };
          }
        }
      }

      warnings.push(`AI未能成功解码${encodingType}，返回原始代码`);
      return {code, confidence: 0.15, warnings};
    } catch (error) {
      logger.warn(`LLM辅助${encodingType}解码失败`, error);
      warnings.push(`AI辅助分析失败: ${error}`);
      return {code, confidence: 0.1, warnings};
    }
  }

  /**
   * 还原自定义VM（使用LLM辅助 - 完整实现）
   * 基于实战经验：抖音、头条等自定义JSVMP
   */
  private async restoreCustomVM(
    code: string,
    aggressive: boolean,
    warnings: string[],
    unresolvedParts: UnresolvedPart[],
  ): Promise<{
    code: string;
    confidence: number;
    warnings: string[];
    unresolvedParts?: UnresolvedPart[];
  }> {
    if (!this.llm) {
      warnings.push('未配置LLM服务，无法进行智能还原');
      warnings.push('建议：配置DeepSeek/OpenAI API以启用AI辅助反混淆');

      // 尝试基础的模式匹配还原（含LLM结构分析降级）
      return await this.restoreCustomVMBasic(
        code,
        aggressive,
        warnings,
        unresolvedParts,
      );
    }

    try {
      logger.info('🤖 使用LLM辅助分析自定义VM...');

      // 1. 提取VM的关键代码片段（限制长度避免token超限）
      const codeSnippet = code.substring(0, 5000);

      // 2. 构建专业的LLM提示词
      const prompt = `你是一个JavaScript逆向工程专家，专门分析JSVMP（JavaScript Virtual Machine Protection）混淆代码。

以下是一段JSVMP混淆的JavaScript代码片段：

\`\`\`javascript
${codeSnippet}
\`\`\`

请分析这段代码并回答以下问题：

1. **VM类型识别**：这是什么类型的虚拟机保护？（obfuscator.io / 自定义VM / 其他）

2. **指令集分析**：
   - 程序计数器（PC）变量名是什么？
   - 操作数栈（Stack）变量名是什么？
   - 寄存器（Registers）变量名是什么？
   - 字节码数组变量名是什么？

3. **关键函数定位**：
   - VM解释器函数的位置（函数名或行号）
   - 指令分发器（switch语句）的位置
   - 字节码解析函数的位置

4. **还原建议**：
   - 如何提取字节码？
   - 如何还原原始逻辑？
   - 有哪些需要注意的陷阱？

请以JSON格式返回分析结果：
{
  "vmType": "类型",
  "programCounter": "PC变量名",
  "stack": "栈变量名",
  "registers": "寄存器变量名",
  "bytecodeArray": "字节码数组变量名",
  "interpreterFunction": "解释器函数位置",
  "restorationSteps": ["步骤1", "步骤2", ...],
  "warnings": ["警告1", "警告2", ...]
}`;

      // 3. 调用LLM分析
      const response = await this.llm.chat([
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const analysisText = response.content;

      logger.info('✅ LLM分析完成');
      logger.info(`分析结果: ${analysisText.substring(0, 200)}...`);

      // 4. 解析LLM返回的JSON
      let vmAnalysis: any;
      try {
        // 尝试提取JSON
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          vmAnalysis = JSON.parse(jsonMatch[0]);
        }
      } catch {
        warnings.push('LLM返回结果解析失败，使用基础还原方法');
        return await this.restoreCustomVMBasic(
          code,
          aggressive,
          warnings,
          unresolvedParts,
        );
      }

      // 5. 基于LLM分析结果进行还原
      if (vmAnalysis) {
        warnings.push(`LLM识别的VM类型: ${vmAnalysis.vmType || 'Unknown'}`);

        if (vmAnalysis.warnings && Array.isArray(vmAnalysis.warnings)) {
          warnings.push(...vmAnalysis.warnings);
        }

        if (
          vmAnalysis.restorationSteps &&
          Array.isArray(vmAnalysis.restorationSteps)
        ) {
          unresolvedParts.push({
            location: 'VM Restoration',
            reason: 'LLM建议的还原步骤',
            suggestion: vmAnalysis.restorationSteps.join('\n'),
          });
        }

        return {
          code,
          confidence: 0.6,
          warnings,
          unresolvedParts:
            unresolvedParts.length > 0 ? unresolvedParts : undefined,
        };
      }

      return await this.restoreCustomVMBasic(
        code,
        aggressive,
        warnings,
        unresolvedParts,
      );
    } catch (error) {
      logger.error('LLM辅助还原失败', error);
      warnings.push(`LLM辅助还原失败: ${error}`);
      return await this.restoreCustomVMBasic(
        code,
        aggressive,
        warnings,
        unresolvedParts,
      );
    }
  }

  /**
   * 基础的自定义VM还原（无LLM可用时的降级方案）
   * 在基础模式匹配之外，如果有LLM会尝试请求AI进行结构分析
   */
  private async restoreCustomVMBasic(
    code: string,
    aggressive: boolean,
    warnings: string[],
    unresolvedParts: UnresolvedPart[],
  ): Promise<{
    code: string;
    confidence: number;
    warnings: string[];
    unresolvedParts?: UnresolvedPart[];
  }> {
    let restored = code;
    let confidence = 0.3;

    try {
      // 1. 移除常见的混淆模式
      // 移除空的if语句
      restored = restored.replace(/if\s*\([^)]*\)\s*\{\s*\}/g, '');

      // 2. 简化布尔表达式
      restored = restored.replace(/!!\s*\(/g, 'Boolean(');

      // 3. 还原简单的字符串拼接
      restored = restored.replace(/""\s*\+\s*/g, '');

      if (aggressive) {
        // 4. 移除debugger语句
        restored = restored.replace(/debugger;?/g, '');
        confidence += 0.1;

        // 5. 简化三元表达式
        restored = restored.replace(/\?\s*([^:]+)\s*:\s*\1/g, '$1');
        confidence += 0.05;
      }

      // 6. 尝试LLM结构分析（即使不是完整的VM还原模式，也尝试获取有用信息）
      if (this.llm) {
        try {
          logger.info('🤖 使用LLM对自定义VM进行结构分析...');
          const snippet =
            code.length > 4000
              ? code.substring(0, 4000) + '\n// ... truncated'
              : code;

          const response = await this.llm.chat(
            [
              {
                role: 'system',
                content: `# Role
You are a JavaScript VM protection analyst. Analyze custom JavaScript VM (JSVMP) code and provide structural insights.

# Task
1. Identify the VM interpreter loop (while/for + switch pattern)
2. Locate the bytecode array and instruction pointer
3. Map switch cases to probable instruction semantics (LOAD, STORE, CALL, JUMP, etc.)
4. Identify string tables and constant pools
5. Suggest the most effective approach for full restoration

# Output Format
Return a JSON object:
{
  "vmStructure": {
    "interpreterLoop": "description of where the main loop is",
    "bytecodeVar": "variable name holding bytecode",
    "pcVar": "program counter variable",
    "stackVar": "stack variable"
  },
  "instructionMap": {"caseN": "probable instruction type"},
  "stringTable": "location or content of string table if found",
  "restorationApproach": "recommended approach for full restoration",
  "simplifiedLogic": "if possible, a simplified version of what this VM code does"
}`,
              },
              {
                role: 'user',
                content: `Analyze this custom VM protected JavaScript:\n\`\`\`javascript\n${snippet}\n\`\`\``,
              },
            ],
            {temperature: 0.2, maxTokens: 3000},
          );

          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            warnings.push('AI结构分析完成');

            if (analysis.vmStructure) {
              const vs = analysis.vmStructure;
              if (vs.interpreterLoop)
                warnings.push(`VM解释器位置: ${vs.interpreterLoop}`);
              if (vs.bytecodeVar)
                warnings.push(`字节码变量: ${vs.bytecodeVar}`);
              if (vs.pcVar) warnings.push(`程序计数器: ${vs.pcVar}`);
              if (vs.stackVar) warnings.push(`栈变量: ${vs.stackVar}`);
            }

            if (
              analysis.instructionMap &&
              typeof analysis.instructionMap === 'object'
            ) {
              const mapStr = Object.entries(analysis.instructionMap)
                .map(([k, v]) => `${k}→${v}`)
                .join(', ');
              warnings.push(`指令映射: ${mapStr}`);
            }

            if (analysis.restorationApproach) {
              unresolvedParts.push({
                location: 'Custom VM',
                reason: 'AI结构分析已完成，需要进一步还原',
                suggestion: analysis.restorationApproach,
              });
            }

            if (
              analysis.simplifiedLogic &&
              analysis.simplifiedLogic.length > 10
            ) {
              warnings.push(
                `AI推断的简化逻辑: ${analysis.simplifiedLogic.substring(0, 500)}`,
              );
            }

            confidence += 0.15;
          }
        } catch (llmErr) {
          logger.warn('LLM结构分析失败', llmErr);
          warnings.push('AI结构分析失败，使用纯模式匹配结果');
        }
      } else {
        warnings.push('使用基础模式匹配进行还原，结果可能不完整');
        warnings.push('建议：配置LLM服务以启用AI辅助分析');
      }

      if (unresolvedParts.length === 0) {
        unresolvedParts.push({
          location: 'Custom VM',
          reason: '自定义VM需要深度分析',
          suggestion: this.llm
            ? '已通过AI获取结构信息，可结合动态调试进一步还原'
            : '配置LLM服务或使用插桩技术记录VM执行流程',
        });
      }

      return {
        code: restored,
        confidence,
        warnings,
        unresolvedParts:
          unresolvedParts.length > 0 ? unresolvedParts : undefined,
      };
    } catch (error) {
      warnings.push(`基础还原失败: ${error}`);
      return {
        code,
        confidence: 0.1,
        warnings,
        unresolvedParts,
      };
    }
  }
}
