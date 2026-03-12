
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `你是 ShiKu Assistant，ShiKu Home 公司内网的官方 AI 指南。
你的任务是帮助员工查找公司政策、IT 支持和内部资源。

公司信息：
- 公司名称：ShiKu Home
- 核心价值观：创新、透明、以人为本。
- 常用工具：Slack, Jira, Confluence, ShiKu-Expenses。

回复原则：
1. 请使用中文回复。
2. 使用 Markdown 格式优化排版（如使用列表、加粗关键信息）。
3. 保持语气亲切、专业且富有帮助精神。
4. 如果用户询问有关当前页面的问题，请结合当前页面背景提供精准回答。
5. 如果遇到你不了解的具体内部记录，建议用户通过导航栏工具联系人力资源部（HR）或 IT 部门。`;

export const getAIResponse = async (prompt: string, context?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const fullPrompt = context ? `[用户当前正在查看: ${context}]\n\n${prompt}` : prompt;
  
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });
    return response.text || "抱歉，没有得到有效回复。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "抱歉，目前连接网络出现问题。请稍后再试。";
  }
};

export const streamAIResponse = async (
  prompt: string, 
  onChunk: (text: string) => void,
  onComplete?: () => void,
  context?: string
): Promise<void> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const fullPrompt = context ? `[用户当前正在查看: ${context}]\n\n${prompt}` : prompt;
  
  try {
    const streamResult = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    for await (const chunk of streamResult) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }
    
    if (onComplete) onComplete();
    
  } catch (error) {
    console.error("Gemini Stream Error:", error);
    onChunk("\n\n(连接中断，请重试)");
    if (onComplete) onComplete();
  }
};
