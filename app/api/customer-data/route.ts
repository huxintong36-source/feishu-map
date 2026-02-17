/**
 * =====================================================
 * 客户数据API (app/api/customer-data/route.ts)
 * =====================================================
 * 
 * 这是后端API，从飞书多维表格实时拉取客户数据
 * 
 * 【数据来源】飞书多维表格
 * 
 * 访问方式: GET /api/customer-data
 * 返回格式: JSON { customers: [...], stats: { total, totalVolume } }
 * 
 * 飞书API调用流程:
 * 1. 用 App ID + App Secret 获取 tenant_access_token
 * 2. 用 token 调用多维表格API获取记录
 * =====================================================
 */

import { NextResponse } from "next/server"

// 飞书API基础URL
const FEISHU_API_BASE = "https://open.feishu.cn/open-apis"

// 检查必需的环境变量
function getMissingEnvVars(): string[] {
  const required = [
    "FEISHU_APP_ID",
    "FEISHU_APP_SECRET",
    "FEISHU_APP_TOKEN",
    "FEISHU_TABLE_ID",
  ]

  return required.filter((k) => !process.env[k])
}

/**
 * 获取飞书访问令牌 (tenant_access_token)
 */
async function getAccessToken(): Promise<string> {
  const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }),
  })

  const data = await response.json()
  
  if (data.code !== 0) {
    throw new Error(`获取飞书token失败: ${data.msg}`)
  }

  return data.tenant_access_token
}


/**
 * 从飞书多维表格获取所有记录
 */
async function getTableRecords(token: string): Promise<any[]> {
  const appToken = process.env.FEISHU_APP_TOKEN
  const tableId = process.env.FEISHU_TABLE_ID

  const allRecords: any[] = []
  let pageToken = ""

  do {
    const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500${pageToken ? `&page_token=${pageToken}` : ""}`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })

    const data = await response.json()

    if (data.code !== 0) {
      throw new Error(`获取飞书数据失败: ${data.msg}`)
    }

    if (data.data?.items) {
      allRecords.push(...data.data.items)
    }

    pageToken = data.data?.page_token || ""

  } while (pageToken)

  return allRecords
}

/**
 * 将飞书记录转换为客户数据格式
 *
 * 飞书多维表格字段格式说明:
 * - 文本字段: 直接是字符串
 * - 多选字段: 数组 ["选项1", "选项2"] 或选项ID数组 ["optXXX"]
 * - 富文本字段: 数组 [{text: "内容", type: "text"}]
 * - 地理位置字段: 对象 {location: "经度,纬度", address: "地址"}
 * - 人员字段: 对象 {name: "姓名", id: "xxx"}
 */
function transformRecord(record: any, index: number): { result: any | null; reason?: string } {
  const fields = record.fields || {}

  // helper: read a field that might be string | array | rich-text array | object
  const readAsText = (val: any): string => {
    if (typeof val === "string") return val
    if (typeof val === "number") return String(val)
    if (Array.isArray(val)) {
      const texts = val.map((v) => (v && typeof v.text === "string" ? v.text : String(v))).filter(Boolean)
      return texts.join(" ")
    }
    if (val && typeof val === "object") {
      if (typeof val.name === "string") return val.name
      if (typeof val.text === "string") return val.text
    }
    return ""
  }

  // ========== 必需字段：门店名称 ==========
  const rawName = fields["门店"] || fields["客户企业名称"] || ""
  const name = readAsText(rawName)
  if (!name) return { result: null, reason: "缺少门店名称" }

  // ========== 提取经纬度与地址（优先使用 poiInfo.location / fullAddress） ==========
  let coordsRaw: string | undefined
  let address = ""
  const shopLoc = fields["门店定位"]
  const poi = shopLoc?.locations?.[0]?.poiInfo || shopLoc?.locations?.[0]?.poiInfo || null
  if (poi && typeof poi === "object") {
    if (typeof poi.location === "string" && poi.location.trim()) coordsRaw = poi.location
    address = poi.fullAddress || poi.full_address || poi.address || address
  }

  // 备用解析：直接从门店定位对象/数组里取 location 或 lng/lat
  if (!coordsRaw && shopLoc) {
    if (typeof shopLoc === "string") coordsRaw = shopLoc
    else if (Array.isArray(shopLoc) && shopLoc.length === 2 && typeof shopLoc[0] === "number") coordsRaw = `${shopLoc[0]},${shopLoc[1]}`
    else if (shopLoc.location) coordsRaw = shopLoc.location
    else if (shopLoc.lng && shopLoc.lat) coordsRaw = `${shopLoc.lng},${shopLoc.lat}`
    else if (shopLoc.longitude && shopLoc.latitude) coordsRaw = `${shopLoc.longitude},${shopLoc.latitude}`
  }

  // 备用：拆字段经/纬
  if (!coordsRaw) {
    const keys = Object.keys(fields)
    const latKey = keys.find(k => /纬度|latitude|lat/i.test(k))
    const lngKey = keys.find(k => /经度|longitude|lng/i.test(k))
    if (latKey && lngKey) {
      const latVal = readAsText(fields[latKey])
      const lngVal = readAsText(fields[lngKey])
      const latNum = parseFloat(latVal)
      const lngNum = parseFloat(lngVal)
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) coordsRaw = `${lngNum},${latNum}`
    }
  }

  if (!coordsRaw) return { result: null, reason: "缺少定位字段或定位字段格式不支持" }

  const coordMatch = String(coordsRaw).match(/(-?\d+\.?\d*)[,，\s]+(-?\d+\.?\d*)/)
  if (!coordMatch) return { result: null, reason: `无法解析坐标: ${coordsRaw}` }

  let a = parseFloat(coordMatch[1])
  let b = parseFloat(coordMatch[2])
  let lng = a
  let lat = b
  if (a >= 18 && a <= 54 && b >= 73 && b <= 135) {
    lng = b; lat = a
  } else if (a >= 73 && a <= 135 && b >= 18 && b <= 54) {
    lng = a; lat = b
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { result: null, reason: `解析后坐标不是数字: ${coordsRaw}` }

  // ========== 其他字段按要求映射 ==========
  const productName = readAsText(fields["竞品产品"]) || "未知"
  const brand = readAsText(fields["竞品品牌"]) || ""
  const discountprice = readAsText(fields["折扣/价格"]) || ""

  // 富文本字段：经销商、片区、省区
  const distributor = readAsText(fields["经销商"]) || ""
  const region = readAsText(fields["province"]) || ""
  const district = readAsText(fields["片区"]) || ""


  // record_date
  let record_date: number | string | null = null
  const rd = fields["记录日期"]
  if (Array.isArray(rd) && rd.length > 0) record_date = Number(rd[0])
  else if (rd !== undefined && rd !== null) record_date = Number(rd) || String(rd)
  // 格式化 record_date 为 YYYY-MM-DD（如为时间戳则转换）
  const formatDate = (v: number | string | null): string | null => {
    if (v === null || v === undefined || v === "") return null
    const n = typeof v === "number" ? v : parseInt(String(v), 10)
    if (Number.isFinite(n)) {
      let ms = n
      if (n < 1e11) ms = n * 1000
      const d = new Date(ms)
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
    try {
      const d2 = new Date(String(v))
      if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10)
    } catch (e) {
      // ignore
    }
    return null
  }

  const record_date_formatted = formatDate(record_date)

  // 宽松提取 record id：支持 record.record_id | record.id | record.recordId
  const recId = record.record_id || record.id || record.recordId || `customer-${index}`

  const result = {
    id: recId,
    name,
    coordinates: [lng, lat] as [number, number],
    productName,
    brand,
    discountprice,
    address: address || "",
    distributor,
    region,
    record_date: record_date_formatted,
    district,
  }

  return { result }
}

/**
 * GET请求处理函数
 */
export async function GET(request?: Request) {
  try {
    console.log("开始从飞书获取数据...")

    // 在尝试调用飞书 API 之前，先确保必要的 env 已配置
    const missing = getMissingEnvVars()
    if (missing.length) {
      const msg = `缺少环境变量: ${missing.join(", ")}. 请复制 .env.local.example 到 .env.local 并填写对应值.`
      console.error("环境变量缺失:", msg)
      return NextResponse.json(
        {
          error: msg,
          customers: [],
          stats: { total: 0, totalVolume: 0 },
        },
        { status: 400 }
      )
    }

    const token = await getAccessToken()
    console.log("成功获取飞书token")

    const records = await getTableRecords(token)
    console.log(`获取到 ${records.length} 条记录`)

    // 打印前2条原始记录用于调试
    if (records.length > 0) {
      console.log("=== 飞书多维表格原始数据结构（前2条）===")
      console.log(JSON.stringify(records.slice(0, 2), null, 2))
      console.log("=== 原始数据结束 ===")
    }

    const customers = []
    const failed: Array<{ index: number; id?: string; reason: string; raw?: any }> = []
    let totalVolume = 0

    for (let i = 0; i < records.length; i++) {
      const out = transformRecord(records[i], i)
      if (out.result) {
        customers.push(out.result)
        totalVolume += out.result.dailyVolumeNum || 0
      } else {
        failed.push({ index: i, id: records[i]?.record_id, reason: out.reason || "unknown", raw: records[i] })
      }
    }

    console.log(`成功转换 ${customers.length} 条客户数据, 失败 ${failed.length} 条`)

    const resp: any = {
      customers,
      stats: {
        total: customers.length,
        totalVolume,
      },
    }

    // 如果启用了调试转换，附加失败详情（只在本地或显式开启时输出）
    if (process.env.DEBUG_TRANSFORM === "1") {
      resp.debug = {
        failed: failed.map((f) => {
          const raw = f.raw?.fields || {}
          const keys = Object.keys(raw)
          const preview: Record<string,string> = {}
          for (const k of keys.slice(0, 8)) {
            try {
              const v = raw[k]
              const s = typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v)
              preview[k] = s.length > 200 ? s.slice(0, 200) + '...' : s
            } catch (e) {
              preview[k] = String(typeof raw[k])
            }
          }

          return { index: f.index, id: f.id, reason: f.reason, keys, preview }
        }),
      }
      console.log("transform debug:", resp.debug)
    }

    return NextResponse.json(resp)

  } catch (error) {
    console.error("飞书API错误:", error)
    return NextResponse.json(
      {
        error: String(error),
        customers: [],
        stats: { total: 0, totalVolume: 0 },
      },
      { status: 500 }
    )
  }
}
