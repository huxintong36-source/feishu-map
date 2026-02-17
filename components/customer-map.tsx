/**
 * =====================================================
 * 客户地图组件 (components/customer-map.tsx)
 * =====================================================
 *
 * 这是整个应用最核心、最复杂的组件
 * 负责显示地图、客户标记、筛选功能、详情抽屉等所有交互
 *
 * 主要功能:
 * 1. 高德地图显示
 * 2. 客户点聚合(MarkerCluster)
 * 3. 筛选功能(客户类型、日均件量、快递公司)
 * 4. 搜索功能
 * 5. 客户详情抽屉
 * 6. 从飞书多维表格实时拉取数据
 *
 * 依赖:
 * - 高德地图 JS API 2.0
 * - @amap/amap-jsapi-loader
 * =====================================================
 */

"use client" // 客户端组件标记

import type React from "react"
import { useEffect, useState, useRef } from "react"
import AMapLoader from "@amap/amap-jsapi-loader" // 高德地图加载器

/**
 * 全局类型声明
 * 告诉TypeScript: window对象上会有这些高德地图相关的属性
 */
declare global {
  interface Window {
    AMap: any // 高德地图主对象
    _AMapSecurityConfig: {
      securityJsCode: string // 安全密钥
    }
  }
}

/**
 * 客户数据接口定义
 * 描述每个客户对象包含哪些字段
 */
interface CustomerData {
  id: string // 唯一标识
  name: string // 竞品品牌
  coordinates: [number, number] // 坐标 [经度, 纬度]
  productName: string // 货品名称
  address: string // 地址
  brand: string // 品牌字段
  discountprice: string // 折扣/价格
  distributor: string // 经销商
  district: string // 片区
  record_date: number | string | null // 记录日期
  region: string // 省区
}

/**
 * 品牌Logo映射
 * 键: 品牌名称
 * 值: Logo图片路径(存放在public/images目录)
 */
const BRAND_LOGOS: Record<string, string> = {
  雕牌: "/images/diaopai.png",
  其他: "", // 其他类型没有logo
}

/**
 * 地图主组件
 */
export default function CustomerMap() {
  // ==================== 状态管理 ====================

  /**
   * useState 说明:
   * useState(初始值) 返回 [当前值, 修改函数]
   * 当调用修改函数时,组件会重新渲染
   */

  // 客户数据
  const [customers, setCustomers] = useState<CustomerData[]>([]) // 所有客户
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerData[]>([]) // 筛选后的客户

  // 加载状态
  const [loading, setLoading] = useState(true) // 数据加载中
  const [mapReady, setMapReady] = useState(false) // 地图准备就绪

  // 筛选条件
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"all" | "old" | "new">("all") // 客户类型筛选
  const [brandFilter, setBrandFilter] = useState<string[]>([]) // 品牌筛选(多选)
  const [regionFilter, setRegionFilter] = useState<string[]>([]) // 省区筛选(多选)

  // 搜索
  const [searchQuery, setSearchQuery] = useState("") // 搜索关键词

  // 菜单开关状态
  const [filterMenuOpen, setFilterMenuOpen] = useState(false) // 筛选菜单
  const [statsMenuOpen, setStatsMenuOpen] = useState(false) // 统计信息菜单

  // 详情抽屉
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null) // 选中的客户
  const [drawerHeight, setDrawerHeight] = useState(30) // 抽屉高度(百分比)
  const [isDragging, setIsDragging] = useState(false) // 是否正在拖拽

  // 飞书发送状态
  const [feishuStatus, setFeishuStatus] = useState<"idle" | "sending" | "success" | "error">("idle")
  const [feishuError, setFeishuError] = useState<string>("")

  // AI 分析弹窗
  const [aiOpen, setAiOpen] = useState(false)
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [aiText, setAiText] = useState<string>("")
  const [aiError, setAiError] = useState<string>("")
  const [aiMeta, setAiMeta] = useState<{ total?: number; updatedAt?: string } | null>(null)

  // AI 请求控制器
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * useRef 说明:
   * useRef 创建一个"引用",其值在组件重新渲染时保持不变
   * 常用于:
   * 1. 存储DOM元素引用
   * 2. 存储不需要触发重新渲染的值
   */

  // DOM引用
  const mapContainerRef = useRef<HTMLDivElement | null>(null) // 地图容器
  const drawerRef = useRef<HTMLDivElement>(null) // 抽屉容器

  // 地图相关引用
  const mapRef = useRef<any>(null) // 高德地图实例
  const clusterRef = useRef<any>(null) // （保留，兼容历史）点聚合实例
  const markersRef = useRef<any[]>([]) // 当前显示的单点标记数组

  // 拖拽相关
  const dragStartY = useRef(0) // 拖拽起始Y坐标
  const dragStartHeight = useRef(0) // 拖拽起始高度

  // ==================== 事件处理函数 ====================

  /**
   * 抽屉拖拽开始
   *
   * @param e - 触摸或鼠标事件
   */
  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡
    setIsDragging(true)

    // 获取起始Y坐标(兼容触摸和鼠标)
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    dragStartY.current = clientY
    dragStartHeight.current = drawerHeight
  }

  /**
   * 抽屉拖拽移动
   *
   * @param e - 触摸或鼠标事件
   */
  const handleDragMove = (e: TouchEvent | MouseEvent) => {
    if (!isDragging) return

    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    const deltaY = dragStartY.current - clientY // 移动距离
    const windowHeight = window.innerHeight
    const deltaPercent = (deltaY / windowHeight) * 100 // 转换为百分比

    // 限制高度范围: 20% ~ 80%
    const newHeight = Math.min(80, Math.max(20, dragStartHeight.current + deltaPercent))
    setDrawerHeight(newHeight)
  }

  /**
   * 抽屉拖拽结束
   */
  const handleDragEnd = () => {
    setIsDragging(false)
    // 如果高度太小,关闭抽屉
    if (drawerHeight < 25) {
      setSelectedCustomer(null)
    }
  }

  /**
   * 切换快递公司筛选
   * 如果已选中则取消,未选中则添加
   */
  const togglebrandFilter = (brand: string) => {
    setBrandFilter((prev) =>
      prev.includes(brand) ? prev.filter((c) => c !== brand) : [...prev, brand]
    )
  }

  // 快递公司列表
  const BRANDS = ["全部品牌","雕牌", "白猫","其他"]

  // 省区列表
  const REGIONS = ["全部省区", "长三角省区", "山东省区", "广东省区"]

  /**
   * 初始化高德地图
   * 当数据加载完成后,初始化地图
   */
  useEffect(() => {
    // 检查是否需要初始化
    if (typeof window === "undefined" || mapRef.current || !mapContainerRef.current || loading) {
      return
    }

    // 设置高德地图安全密钥（从环境变量读取，客户端需使用 NEXT_PUBLIC_ 前缀）
    const amapSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || ""
    if (!amapSecurityCode) {
      console.warn("NEXT_PUBLIC_AMAP_SECURITY_CODE is not set. AMap security features may not work as expected.")
    }
    window._AMapSecurityConfig = {
      securityJsCode: amapSecurityCode,
    }

    console.log("Loading AMap...")

    // 加载高德地图（key 从环境变量读取，必须使用 NEXT_PUBLIC_AMAP_KEY）
    const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY || ""
    if (!amapKey) {
      console.warn("NEXT_PUBLIC_AMAP_KEY is not set. AMap will fail to load without a valid key.")
    }
    // 加载高德地图
    AMapLoader.load({
      key: amapKey, // 高德地图API Key
      version: "2.0", // API版本
      plugins: ["AMap.MarkerCluster", "AMap.DistrictSearch"], // 加载的插件
    })
      .then((AMap) => {
        console.log("AMap loaded successfully")

        // 创建地图实例
        const map = new AMap.Map(mapContainerRef.current, {
          zoom: 7, // 初始缩放级别
          center: [113.65, 34.76], // 初始中心点(郑州)
          viewMode: "2D", // 2D模式
        })

        mapRef.current = map

        // 创建行政区查询对象,用于绘制省份边界
        const district = new AMap.DistrictSearch({
          extensions: "all", // 返回完整数据
          subdistrict: 1, // 获取第一级子区域(省)
        })

        // 搜索中国,获取所有省份
        district.search("中国", (status: string, result: any) => {
          if (status === "complete" && result.districtList[0]?.districtList) {
            const provinces = result.districtList[0].districtList

            // 遍历每个省份
            provinces.forEach((province: any) => {
              // 绘制省份边界线
              if (province.boundaries) {
                province.boundaries.forEach((boundary: any) => {
                  const polygon = new AMap.Polygon({
                    path: boundary,
                    strokeColor: "#0088ff", // 蓝色边框
                    strokeWeight: 1.5, // 线宽
                    strokeOpacity: 0.6, // 透明度
                    fillColor: "transparent", // 无填充
                    fillOpacity: 0,
                  })
                  polygon.setMap(map)
                })
              }

              // 为每个省份查询城市边界
              const cityDistrict = new AMap.DistrictSearch({
                extensions: "all",
                level: "city",
              })

              cityDistrict.search(province.adcode, (cityStatus: string, cityResult: any) => {
                if (cityStatus === "complete" && cityResult.districtList[0]?.districtList) {
                  const cities = cityResult.districtList[0].districtList

                  // 绘制城市边界线
                  cities.forEach((city: any) => {
                    if (city.boundaries) {
                      city.boundaries.forEach((boundary: any) => {
                        const polygon = new AMap.Polygon({
                          path: boundary,
                          strokeColor: "#888888", // 灰色边框
                          strokeWeight: 0.8, // 更细的线
                          strokeOpacity: 0.4, // 更透明
                          fillColor: "transparent",
                          fillOpacity: 0,
                        })
                        polygon.setMap(map)
                      })
                    }
                  })
                }
              })
            })
          }
        })

        setMapReady(true)
        console.log("Map initialized with city boundaries")
      })
      .catch((error) => {
        console.error("Error loading AMap:", error)
        setLoading(false)
      })

    // 清理函数: 组件卸载时销毁地图
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [loading])

  /**
   * 创建点聚合
   * 当地图就绪且有客户数据时,创建点聚合
   */
  useEffect(() => {
    if (!mapReady || !mapRef.current || !filteredCustomers.length) {
      console.log("Skipping markers - mapReady:", mapReady, "customers:", filteredCustomers.length)
      // 清除已有的 markers
      if (markersRef.current && markersRef.current.length) {
        markersRef.current.forEach((m) => { try { m.setMap && m.setMap(null) } catch (e) {} })
        markersRef.current = []
      }
      return
    }

    const AMap = window.AMap
    if (!AMap) {
      console.log("AMap not available")
      return
    }

    // 清除已有的 markers
    if (markersRef.current && markersRef.current.length) {
      markersRef.current.forEach((m) => { try { m.setMap && m.setMap(null) } catch (e) {} })
      markersRef.current = []
    }

    console.log("Creating individual markers with", filteredCustomers.length, "points")

    // 为每个客户创建单独 Marker
    filteredCustomers.forEach((customer) => {
      const pinSize = 28
      let pinColor = "#3b82f6"
      if (customer.brand === "雕牌") pinColor = "#ef4444"

      const div = document.createElement("div")
      div.style.position = "relative"
      div.style.width = `${pinSize}px`
      div.style.height = `${pinSize * 1.2}px`
      div.style.cursor = "pointer"
      div.innerHTML = `
        <svg width="${pinSize}" height="${pinSize * 1.2}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C7.6 0 4 3.6 4 8c0 5.4 8 16 8 16s8-10.6 8-16c0-4.4-3.6-8-8-8z" 
                fill="${pinColor}" 
                stroke="white" 
                strokeWidth="1.5"
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"/>
          <circle cx="12" cy="8" r="4" fill="white"/>
        </svg>
      `

      const tooltip = document.createElement("div")
      tooltip.style.position = "absolute"
      tooltip.style.bottom = "100%"
      tooltip.style.left = "50%"
      tooltip.style.transform = "translateX(-50%)"
      tooltip.style.marginBottom = "4px"
      tooltip.style.padding = "4px 8px"
      tooltip.style.backgroundColor = "white"
      tooltip.style.border = "2px solid " + pinColor
      tooltip.style.borderRadius = "6px"
      tooltip.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)"
      tooltip.style.display = "none"
      tooltip.style.whiteSpace = "nowrap"
      tooltip.style.zIndex = "1000"
      tooltip.style.fontSize = "12px"

      const brandNames = (customer.brand || "").split(/[、,，]/).map((c: string) => c.trim())
      const logos = brandNames
        .map((name: string) => {
          const logoUrl = BRAND_LOGOS[name]
          if (logoUrl) {
            return `<img src="${logoUrl}" alt="${name}" style="height: 24px; width: auto; object-fit: contain; display: inline-block; vertical-align: middle;" />`
          }
          return `<span style="font-size: 12px; vertical-align: middle;">${name}</span>`
        })
        .join(" ")
      tooltip.innerHTML = logos
      tooltip.style.display = "none"
      tooltip.style.flexDirection = "row"
      tooltip.style.alignItems = "center"
      tooltip.style.gap = "4px"

      div.appendChild(tooltip)
      div.addEventListener("mouseenter", () => { tooltip.style.display = "block" })
      div.addEventListener("mouseleave", () => { tooltip.style.display = "none" })

      // 创建高德 Marker
      const marker = new AMap.Marker({
        position: customer.coordinates,
        content: div,
      })
      try {
        marker.setOffset(new AMap.Pixel(-pinSize / 2, -pinSize * 1.2))
      } catch (e) {}
      marker.setMap(mapRef.current)

      marker.on("click", () => {
        setSelectedCustomer(customer)
        setDrawerHeight(30)
      })

      markersRef.current.push(marker)
    })

    console.log("Markers created")
  }, [mapReady, filteredCustomers])

  /**
   * 监听抽屉拖拽事件
   */
  useEffect(() => {
    if (!selectedCustomer) return

    const handleMove = (e: TouchEvent | MouseEvent) => handleDragMove(e)
    const handleEnd = () => handleDragEnd()

    // 添加事件监听
    document.addEventListener("touchmove", handleMove, { passive: false })
    document.addEventListener("mousemove", handleMove)
    document.addEventListener("touchend", handleEnd)
    document.addEventListener("mouseup", handleEnd)

    // 清理函数
    return () => {
      document.removeEventListener("touchmove", handleMove)
      document.removeEventListener("mousemove", handleMove)
      document.removeEventListener("touchend", handleEnd)
      document.removeEventListener("mouseup", handleEnd)
    }
  }, [selectedCustomer, isDragging, drawerHeight])

  // ==================== 加载客户数据 ====================

  useEffect(() => {
    const parseCSVData = async () => {
      try {
        console.log("Fetching customer data...")

        // 调用客户数据API
            const response = await fetch("/api/customer-data")
            const data = await response.json()

            if (data && data.customers) {
              console.log("Loaded", data.customers.length, "customers")
              // Normalize incoming records to match CustomerData interface expectations
              const normalized: CustomerData[] = data.customers.map((c: any) => ({
                id: c.id || String(c.record_id || c.recordId || Math.random()),
                name: c.name || "",
                coordinates: Array.isArray(c.coordinates) && c.coordinates.length === 2 ? c.coordinates : [0, 0],
                productName: c.productName || c.product_name || "未知",
                brandCategory: c.brandCategory || "未知",
                mainWeightRange: c.mainWeightRange || "未知",
                courier: c.courier || "其他",
                address: c.address || "",
                brand: c.brand || c.distributor || "",
                discountprice: c.discountprice || "",
                record_date: c.record_date || null,
                distributor: c.distributor || "",
                region: c.region || "",
                district: c.district || "",
              }))

              // 调试：查看所有唯一的 province 值
              const uniqueRegions = [...new Set(normalized.map(c => c.region).filter(Boolean))]
              console.log("数据中的所有省区值:", uniqueRegions)

              setCustomers(normalized)
              setFilteredCustomers(normalized)
            }
        setLoading(false)
      } catch (error) {
        console.error("Error fetching customer data:", error)
        setLoading(false)
      }
    }

    parseCSVData()
  }, []) // 空依赖数组: 只执行一次

  // ==================== 筛选逻辑 ====================

  useEffect(() => {
    let filtered = customers

    // 1. 搜索筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((customer) => {
        // 搜索多个字段（对可选字段做保护）
        const name = (customer.name || "").toLowerCase()
        const product = (customer.productName || "").toLowerCase()
        const brand = (customer.brand || "").toLowerCase()
        const brandCategory = (customer.brand || "").toLowerCase()
        const address = (customer.address || "").toLowerCase()

        // 搜索多个字段
        return (
          name.includes(query) ||
          product.includes(query) ||
          brand.includes(query) ||
          brandCategory.includes(query) ||
          address.includes(query)
        )
      })
    }

    // 2. 省区筛选(支持多选)
    if (regionFilter.length > 0) {
      filtered = filtered.filter((c) => {
        // 直接使用 province 字段匹配省区
        return regionFilter.includes(c.region || "")
      })
    }

    // 3. 品牌筛选(支持多选)
    if (brandFilter.length > 0) {
      filtered = filtered.filter((c) => {
        // 将客户的品牌字段拆分为数组(支持"雕牌、其他"这种格式)，对可选值做保护
        const customerBrands = (c.brand || "").split(/[、,，]/).map((name) => name.trim()).filter(Boolean)
        // 检查是否包含任一选中的品牌
        return brandFilter.some((selectedBrand) => customerBrands.includes(selectedBrand))
      })
    }

    setFilteredCustomers(filtered)
  }, [customerTypeFilter, brandFilter, regionFilter, customers, searchQuery])

  // ==================== 计算属性 ====================

  // 计算当前激活的筛选条件数量(用于显示角标)
  const activeFilterCount =
    (customerTypeFilter !== "all" ? 1 : 0) + brandFilter.length + regionFilter.length

  // 统计信息
  const stats = {
    total: filteredCustomers.length,
    totalVolume: filteredCustomers.reduce((sum, c) => sum , 0),
    topProducts: (() => {
      // 统计每个产品的出现次数
      const productCount: Record<string, number> = {}
      filteredCustomers.forEach((c) => {
        const product = c.productName || "未知"
        productCount[product] = (productCount[product] || 0) + 1
      })

      // 按出现次数排序，取前5个
      return Object.entries(productCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))
    })(),
  }

  // ==================== 飞书发送 ====================

  const sendFilteredToFeishu = async () => {
    if (feishuStatus === "sending") return

    // 创建新的 AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller

    setFeishuStatus("sending")
    setFeishuError("")
    setAiStatus("loading")

    try {
      const res = await fetch("/api/feishu/send-filtered", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customers: filteredCustomers,
          stats,
          filters: {
            brandFilter,
            customerTypeFilter,
            regionFilter,
          },
          searchQuery,
        }),
        signal: controller.signal, // 添加 abort signal
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "飞书发送失败")
      }

      // 直接从 send-filtered 的响应中提取 summary
      // 响应结构: data.data.data.summary
      let summary = ""

      // 按照实际响应结构提取 summary
      if (data?.data?.data?.data?.summary) {
        summary = data.data.data.data.summary
      } else if (data?.data?.data?.summary) {
        summary = data.data.data.summary
      } else if (data?.data?.summary) {
        summary = data.data.summary
      } else if (typeof data?.data === "string") {
        summary = data.data
      }

      console.log("AI 分析响应:", data)
      console.log("提取的 summary:", summary)

      if (summary) {
        setAiText(summary)
        setAiMeta({
          total: stats.total,
          updatedAt: new Date().toISOString()
        })
        setAiStatus("ready")
      } else {
        setAiStatus("error")
        setAiError("未能获取分析结果")
      }

      setFeishuStatus("success")
      setTimeout(() => setFeishuStatus("idle"), 3000)
    } catch (err: any) {
      // 如果是主动取消的请求，不设置错误状态
      if (err?.name === "AbortError") {
        console.log("AI 分析已取消")
        return
      }
      setFeishuStatus("error")
      setFeishuError(err?.message || "飞书发送失败")
      setAiStatus("error")
      setAiError(err?.message || "AI分析失败")
    } finally {
      abortControllerRef.current = null
    }
  }

  // 取消 AI 分析
  const cancelAiAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    // 重置状态
    setFeishuStatus("idle")
    setAiStatus("idle")
  }

  // 关闭 AI 弹窗（如果正在加载则取消）
  const closeAiDialog = () => {
    if (aiStatus === "loading" || feishuStatus === "sending") {
      cancelAiAnalysis()
    }
    setAiOpen(false)
  }

  // ==================== 渲染 ====================

  // 加载中显示
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <div className="text-sm font-medium">正在加载地图...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* ==================== 地图容器 ==================== */}
      <div ref={mapContainerRef} id="map-container" className="absolute inset-0 w-full h-full" />

      {/* ==================== 顶部工具栏 ==================== */}
      <div className="absolute top-6 left-3 right-3 z-10 flex items-center gap-2">
        {/* 统计信息按钮 */}
        <button
          onClick={() => {
            setStatsMenuOpen(!statsMenuOpen)
            setFilterMenuOpen(false)
          }}
          className={`w-9 h-9 bg-white/95 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-all active:scale-95 flex-shrink-0 ${
            statsMenuOpen ? "bg-gray-200" : ""
          }`}
        >
          {/* 柱状图图标 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </button>

        {/* 搜索框 */}
        <div className="flex-1 bg-white/95 backdrop-blur-sm rounded-full shadow-lg">
          <input
            type="text"
            placeholder="搜索任意关键词..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs border-0 bg-transparent focus:outline-none placeholder:text-gray-400 px-3 py-1.5"
          />
          {/* 显示搜索结果数量 */}
          {searchQuery && (
            <div className="px-3 pb-1.5 text-[9px] text-gray-500">找到 {filteredCustomers.length} 个结果</div>
          )}
        </div>

        {/* 筛选按钮 */}
        <button
          onClick={() => {
            setFilterMenuOpen(!filterMenuOpen)
            setStatsMenuOpen(false)
          }}
          className={`relative w-9 h-9 bg-white/95 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-all active:scale-95 flex-shrink-0 ${
            filterMenuOpen ? "bg-gray-200" : ""
          }`}
        >
          {/* 滑块图标 */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110 4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
          {/* 筛选数量角标 */}
          {activeFilterCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* AI 分析按钮 */}
        <button
          onClick={() => {
            setAiOpen(true)
            if (feishuStatus !== "sending") {
              sendFilteredToFeishu()
            }
          }}
          className={`w-9 h-9 bg-white/95 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-all active:scale-95 flex-shrink-0 ${
            feishuStatus === "sending" ? "opacity-70" : ""
          }`}
          title="AI 分析（发送筛选结果）"
          disabled={feishuStatus === "sending"}
        >
          {feishuStatus === "sending" ? (
            <div className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-gray-700"></div>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 2a7 7 0 00-4 12.74V17a1 1 0 001 1h6a1 1 0 001-1v-2.26A7 7 0 0012 2zm-3 18h6m-5 2h4"
              />
            </svg>
          )}
        </button>
      </div>

      {/* ==================== 统计信息下拉菜单 ==================== */}
      {statsMenuOpen && (
        <>
          {/* 点击背景关闭菜单 */}
          <div className="fixed inset-0 z-10" onClick={() => setStatsMenuOpen(false)} />
          <div className="absolute top-16 left-3 bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-3 space-y-2 min-w-[200px] z-20">
            <div className="text-xs text-gray-600">记录总数</div>
            <div className="text-lg font-bold text-blue-600">{stats.total}</div>

            {/* 主要竞品产品 */}
            <div className="text-xs text-gray-600">主要竞品产品</div>
            <div className="space-y-1">
              {stats.topProducts.length > 0 ? (
                stats.topProducts.map((product, index) => (
                  <div key={product.name} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 flex items-center gap-1">
                      <span className="text-gray-400 font-mono">{index + 1}.</span>
                      <span className="truncate max-w-[120px]">{product.name}</span>
                    </span>
                    <span className="font-semibold text-purple-600">{product.count}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-400">暂无数据</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ==================== AI 分析弹窗 ==================== */}
      {aiOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={closeAiDialog} />
          <div className="absolute top-20 left-3 right-3 z-30 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <span className="text-blue-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 2a7 7 0 00-4 12.74V17a1 1 0 001 1h6a1 1 0 001-1v-2.26A7 7 0 0012 2zm-3 18h6m-5 2h4"
                    />
                  </svg>
                </span>
                <div className="text-sm font-semibold">AI 分析</div>
                <div className="text-xs text-gray-400">
                  {aiStatus === "loading" || !aiMeta?.total ? `${filteredCustomers.length} 条记录` : `${aiMeta.total} 条记录`}
                </div>
              </div>
              <button
                onClick={closeAiDialog}
                className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-4 text-sm text-gray-700">
              {aiStatus === "loading" && (
                <div className="flex items-center gap-2">
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                  <span>分析中（预计耗时5秒）...</span>
                </div>
              )}
              {aiStatus === "error" && <div className="text-red-600">分析失败: {aiError}</div>}
              {aiStatus === "ready" && <div className="whitespace-pre-wrap">{aiText}</div>}
              {aiStatus === "idle" && <div className="text-gray-500">暂无分析结果</div>}
            </div>
          </div>
        </>
      )}

      {/* ==================== 筛选下拉菜单 ==================== */}
      {filterMenuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setFilterMenuOpen(false)} />
          <div className="absolute top-16 right-3 bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-3 space-y-2 w-48 z-20 max-h-[70vh] overflow-y-auto">
            {/* 省区筛选 */}
            <div className="text-xs font-semibold mb-2">省区</div>
            <div className="space-y-1">
              {REGIONS.map((region) => (
                <button
                  key={region}
                  onClick={() => {
                    if (region === "全部省区") {
                      setRegionFilter([]) // 清空筛选
                    } else {
                      setRegionFilter((prev) =>
                        prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]
                      )
                    }
                  }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                    region === "全部省区"
                      ? regionFilter.length === 0
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 hover:bg-gray-200"
                      : regionFilter.includes(region)
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            {/* 竞品品牌筛选 */}
            <div className="text-xs font-semibold mb-2 mt-3">竞品品牌</div>
            <div className="space-y-1">
              {BRANDS.map((brand) => (
                <button
                  key={brand}
                  onClick={() => {
                    if (brand === "全部品牌") {
                      setBrandFilter([]) // 清空筛选
                    } else {
                      togglebrandFilter(brand)
                    }
                  }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                    brand === "全部品牌"
                      ? brandFilter.length === 0
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 hover:bg-gray-200"
                      : brandFilter.includes(brand)
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ==================== 客户详情抽屉 ==================== */}
      {selectedCustomer && (
        <>
          {/* 背景遮罩 */}
          <div className="absolute inset-0 bg-black/20 z-40" onClick={() => setSelectedCustomer(null)} />

          {/* 抽屉面板 */}
          <div
            ref={drawerRef}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white rounded-t-2xl shadow-2xl z-60"
            style={{
              height: `${drawerHeight}%`,
              maxHeight: "90vh",
              minHeight: "20vh",
              transition: isDragging ? "none" : "height 0.3s ease",
            }}
            onTouchStart={handleDragStart}
            onMouseDown={handleDragStart}
          >
            {/* 拖拽手柄 */}
            <div className="w-full py-3 flex justify-center cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={() => setSelectedCustomer(null)}
              className="absolute top-3 right-3 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors z-10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 抽屉内容 */}
            <div
              className="px-4 pb-4 overflow-y-auto"
              style={{
                height: "calc(100% - 48px)",
                transition: "none",
              }}
            >
              {/* 客户名称 */}
              <h3 className="text-base font-bold mb-3">{selectedCustomer.name}</h3>
              {/* 基本信息列表 */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">竞品品牌</span>
                  {/* 把品牌名和 logo 包在一起 */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-medium ${
                        selectedCustomer.brand === "雕牌" ? "text-blue-600" : "text-red-600"
                      }`}
                    >
                      {selectedCustomer.brand}
                    </span>
                    {BRAND_LOGOS[selectedCustomer.brand] && (
                      <img
                        src={BRAND_LOGOS[selectedCustomer.brand]}
                        alt={selectedCustomer.brand}
                        className="h-4 w-auto object-contain"
                        loading="lazy"
                      />
                    )}
                  </div>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">竞品产品</span>
                  <span className="font-medium">
                  {selectedCustomer.productName}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">折扣/价格</span>
                  <span className="font-medium text-right max-w-[60%]">{selectedCustomer.discountprice || "未知"}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">经销商</span>
                  <span className="font-medium text-right max-w-[60%]">{selectedCustomer.distributor || "未知"}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">省区</span>
                  <span className="font-medium text-right max-w-[60%]">{selectedCustomer.region || "未知"}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">片区</span>
                  <span className="font-medium text-right max-w-[60%]">{selectedCustomer.district || "未知"}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">地址</span>
                  <span className="font-medium text-right max-w-[60%]">{selectedCustomer.address}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">记录日期</span>
                  <span className="font-medium text-right max-w-[60%]">{selectedCustomer.record_date || "未知"}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
