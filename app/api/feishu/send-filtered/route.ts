import { NextResponse } from "next/server"

export const runtime = "nodejs"

type SendFilteredPayload = {
  customers: unknown[]
  stats?: {
    total?: number
    totalVolume?: number
  }
  filters?: {
    brandFilter?: string[]
    customerTypeFilter?: string
    regionFilter?: string[]
  }
  searchQuery?: string
}

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || ""
const DOUBAO_ENDPOINT = process.env.DOUBAO_Endpoint || ""
const DOUBAO_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"

export async function POST(req: Request) {
  if (!DOUBAO_API_KEY) {
    return NextResponse.json({ error: "缺少DOUBAO_API_KEY环境变量" }, { status: 500 })
  }
  if (!DOUBAO_ENDPOINT) {
    return NextResponse.json({ error: "缺少DOUBAO_Endpoint环境变量" }, { status: 500 })
  }

  const body = (await req.json().catch(() => null)) as SendFilteredPayload | null
  if (!body || !Array.isArray(body.customers)) {
    return NextResponse.json({ error: "请求体缺少customers数组" }, { status: 400 })
  }

  // 构建数据摘要
  const dataSummary = {
    时间: new Date().toISOString(),
    总数: body.stats?.total ?? body.customers.length,
    搜索关键词: body.searchQuery || "无",
    省区筛选: (body.filters?.regionFilter || []).join("、") || "无",
    品牌筛选: (body.filters?.brandFilter || []).join("、") || "无",
  }

  // 统计信息
  const brandCount: Record<string, number> = {}
  const provinceCount: Record<string, number> = {}
  const productCount: Record<string, number> = {}
  const discountInfo: string[] = []

  body.customers.forEach((customer: any) => {
    const brand = customer.brand || "未知"
    const province = customer.province || "未知"
    const product = customer.productName || "未知"
    const discount = customer.discountprice || ""

    brandCount[brand] = (brandCount[brand] || 0) + 1
    provinceCount[province] = (provinceCount[province] || 0) + 1
    productCount[product] = (productCount[product] || 0) + 1

    if (discount) {
      discountInfo.push(`${product}: ${discount}`)
    }
  })

  // 构建提示词
  const prompt = `你是一个竞品数据分析助手。用户通过搜索或筛选按钮查看了特定的竞品信息记录，请帮用户总结这些筛选结果。

## 用户筛选条件
- 搜索关键词：${dataSummary.搜索关键词}
- 省区筛选：${dataSummary.省区筛选}
- 品牌筛选：${dataSummary.品牌筛选}

## 筛选结果数据（共 ${dataSummary.总数} 条记录）

### 竞品品牌分布
${Object.entries(brandCount)
  .sort(([, a], [, b]) => b - a)
  .map(([brand, count]) => `- ${brand}：${count}条 (${((count / dataSummary.总数) * 100).toFixed(1)}%)`)
  .join("\n")}

### 竞品产品分布（Top 5）
${Object.entries(productCount)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([product, count]) => `- ${product}：${count}条 (${((count / dataSummary.总数) * 100).toFixed(1)}%)`)
  .join("\n")}

### 省区分布
${Object.entries(provinceCount)
  .sort(([, a], [, b]) => b - a)
  .map(([province, count]) => `- ${province}：${count}条 (${((count / dataSummary.总数) * 100).toFixed(1)}%)`)
  .join("\n")}

### 折扣/价格信息样例（最多展示5条）
${discountInfo.slice(0, 5).map(info => `- ${info}`).join("\n") || "- 暂无折扣信息"}

## 分析要求
请用通俗易懂的语言总结上述数据，重点说明：
1. 根据用户的筛选条件（${dataSummary.搜索关键词 !== "无" ? "关键词「" + dataSummary.搜索关键词 + "」" : ""}${dataSummary.省区筛选 !== "无" ? "、省区「" + dataSummary.省区筛选 + "」" : ""}${dataSummary.品牌筛选 !== "无" ? "、品牌「" + dataSummary.品牌筛选 + "」" : ""}），找到了多少条相关竞品记录
2. 主要是什么品牌的产品，各占比多少
3. 主要的竞品产品有哪些
4. 折扣/价格的整体情况如何（如果有）
5. 地域分布特点

要求简洁专业，2-3段话即可，不要使用列表格式，使用自然的段落叙述。`

  try {
    // 调用火山方舟 Doubao API
    const res = await fetch(DOUBAO_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DOUBAO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DOUBAO_ENDPOINT, // 使用 endpoint ID 作为模型参数
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error("Doubao API call failed", {
        status: res.status,
        response: errorText,
      })
      throw new Error(`Doubao API 调用失败: ${res.status}`)
    }

    const data = await res.json()
    const summary = data?.choices?.[0]?.message?.content || ""

    if (!summary) {
      throw new Error("AI 未返回有效的分析结果")
    }

    // 返回格式保持与之前一致，方便前端解析
    return NextResponse.json({
      ok: true,
      data: {
        data: {
          summary,
        },
      },
    })
  } catch (error: any) {
    console.error("AI analysis error", {
      message: error?.message || String(error),
    })
    return NextResponse.json({ error: error?.message || "AI 分析失败" }, { status: 500 })
  }
}
