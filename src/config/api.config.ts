import { getProxyUrl } from './proxy-url'

// API 配置
export const API_CONFIG = {
  search: {
    path: '/api.php/provide/vod/?ac=videolist&wd=',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
  detail: {
    path: '/api.php/provide/vod/?ac=videolist&ids=',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
}

// 其他配置
// 统一使用内置代理
export const PROXY_URL = getProxyUrl(window.ounDesktop?.proxyUrl)
export const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g

import type { VideoApi } from '@/types/video'
import { INITIAL_CONFIG } from './initialConfig'

type InitialVideoSource = Omit<VideoApi, 'detailUrl' | 'updatedAt' | 'timeout' | 'retry'>

export const INITIAL_VIDEO_SOURCES_VERSION = '1'

const DEFAULT_VIDEO_SOURCES: InitialVideoSource[] = [
  {
    id: 'source1',
    name: '电影天堂资源',
    url: 'http://caiji.dyttzyapi.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source2',
    name: '黑木耳',
    url: 'https://json.heimuer.xyz/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source3',
    name: '如意资源',
    url: 'http://cj.rycjapi.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source4',
    name: '暴风资源',
    url: 'https://bfzyapi.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source5',
    name: '天涯资源',
    url: 'https://tyyszy.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source6',
    name: '非凡影视',
    url: 'http://ffzy5.tv/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source7',
    name: '360资源',
    url: 'https://360zy.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source8',
    name: '茅台资源',
    url: 'https://caiji.maotaizy.cc/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source9',
    name: '卧龙资源',
    url: 'https://wolongzyw.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source10',
    name: '极速资源',
    url: 'https://jszyapi.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source11',
    name: '豆瓣资源',
    url: 'https://dbzy.tv/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source12',
    name: '魔爪资源',
    url: 'https://mozhuazy.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source13',
    name: '魔都资源',
    url: 'https://www.mdzyapi.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source14',
    name: '最大资源',
    url: 'https://api.zuidapi.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source15',
    name: '樱花资源',
    url: 'https://m3u8.apiyhzy.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source16',
    name: '无尽资源',
    url: 'https://api.wujinapi.me/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source17',
    name: '旺旺短剧',
    url: 'https://wwzy.tv/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source18',
    name: 'iKun资源',
    url: 'https://ikunzyapi.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source19',
    name: '量子资源站',
    url: 'https://cj.lziapi.com/api.php/provide/vod',
    isEnabled: true,
  },
  {
    id: 'source20',
    name: '小猫咪资源',
    url: 'https://zy.xmm.hk/api.php/provide/vod',
    isEnabled: true,
  },
]

// 从环境变量获取初始视频源
export const getInitialVideoSources = async (): Promise<VideoApi[]> => {
  // 1. First priority: Full JSON config from VITE_INITIAL_CONFIG
  if (INITIAL_CONFIG?.videoSources && Array.isArray(INITIAL_CONFIG.videoSources)) {
    return parseVideoSources(INITIAL_CONFIG.videoSources)
  }

  // 2. Second priority: Specific VITE_INITIAL_VIDEO_SOURCES
  let envSources = import.meta.env.VITE_INITIAL_VIDEO_SOURCES

  // 验证url
  try {
    new URL(envSources.trim())
    const response = await fetch(PROXY_URL + envSources.trim())
    if (!response.ok) {
      console.error(`无法获取视频源，HTTP状态: ${response.status}`)
      return []
    }
    envSources = await response.text()
  } catch {
    // 不是URL，继续处理
  }

  if (!envSources || typeof envSources !== 'string') {
    return parseVideoSources(DEFAULT_VIDEO_SOURCES)
  }

  try {
    // 清理多行JSON：移除不必要的换行符和空白字符，但保留JSON结构内的空格
    const cleanedSources = envSources
      .replace(/^\s*['"`]/, '') // 移除开头的引号
      .replace(/['"`]\s*$/, '') // 移除结尾的引号
      .trim()

    // 解析 JSON 格式
    const jsonSources = JSON.parse(cleanedSources)
    const sources = Array.isArray(jsonSources) ? jsonSources : [jsonSources]

    return parseVideoSources(sources)
  } catch (error) {
    console.error('解析环境变量中的视频源失败:', error)
    console.error('环境变量内容:', envSources)
    return []
  }
}

// Helper to parse and validate video sources
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseVideoSources = (sources: any[]): VideoApi[] => {
  return sources
    .map((source, index) => {
      if (!source.name || !source.url) {
        console.warn(`跳过无效的视频源配置: ${JSON.stringify(source)}`)
        return null
      }

      return {
        id: (source.id as string) || `env_source_${index}`,
        name: source.name as string,
        url: source.url as string,
        detailUrl: (source.detailUrl as string) || source.url,
        isEnabled: source.isEnabled !== undefined ? (source.isEnabled as boolean) : true,
        updatedAt: source.updatedAt ? new Date(source.updatedAt) : new Date(),
        timeout: (source.timeout as number) || 3000,
        retry: (source.retry as number) || 3,
      } as VideoApi
    })
    .filter((source): source is VideoApi => source !== null)
}
