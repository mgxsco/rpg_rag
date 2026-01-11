'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { KnowledgeGraph } from '@/components/graph/knowledge-graph'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Filter, RotateCcw } from 'lucide-react'

interface GraphNode {
  id: string
  name: string
  canonicalName: string
  type: string
  group: number
}

interface GraphLink {
  id: string
  source: string
  target: string
  type: string
  label: string
  reverseLabel?: string
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface GraphStats {
  totalNodes: number
  totalLinks: number
  nodesByType: Record<string, number>
  linksByType: Record<string, number>
}

const ENTITY_TYPES = [
  { value: 'npc', label: 'NPC', color: '#22c55e' },
  { value: 'location', label: 'Location', color: '#f59e0b' },
  { value: 'item', label: 'Item', color: '#a855f7' },
  { value: 'quest', label: 'Quest', color: '#06b6d4' },
  { value: 'faction', label: 'Faction', color: '#f97316' },
  { value: 'lore', label: 'Lore', color: '#f43f5e' },
  { value: 'session', label: 'Session', color: '#3b82f6' },
  { value: 'player_character', label: 'Player Character', color: '#6366f1' },
  { value: 'freeform', label: 'Freeform', color: '#6b7280' },
]

export default function GraphPage({
  params,
}: {
  params: { campaignId: string }
}) {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [stats, setStats] = useState<GraphStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDM, setIsDM] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [centerId, setCenterId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadGraphData()
  }, [params.campaignId])

  const loadGraphData = async (centerEntity?: string, filterType?: string) => {
    setLoading(true)
    try {
      let url = `/api/campaigns/${params.campaignId}/graph?source=entities`
      if (centerEntity) url += `&center=${centerEntity}&depth=2`
      if (filterType) url += `&type=${filterType}`

      const response = await fetch(url)
      const data = await response.json()
      setGraphData(data.graphData)
      setStats(data.stats)
      setIsDM(data.isDM)
    } catch (error) {
      console.error('Failed to load graph data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleNodeClick = (nodeId: string) => {
    router.push(`/campaigns/${params.campaignId}/entities/${nodeId}`)
  }

  const handleNodeDoubleClick = (nodeId: string) => {
    setCenterId(nodeId)
    loadGraphData(nodeId)
  }

  const toggleTypeFilter = (type: string) => {
    const newSelected = new Set(selectedTypes)
    if (newSelected.has(type)) {
      newSelected.delete(type)
    } else {
      newSelected.add(type)
    }
    setSelectedTypes(newSelected)
  }

  const resetGraph = () => {
    setCenterId(null)
    setSelectedTypes(new Set())
    loadGraphData()
  }

  // Filter graph data based on selected types
  const filteredData = graphData ? {
    nodes: selectedTypes.size > 0
      ? graphData.nodes.filter(n => selectedTypes.has(n.type))
      : graphData.nodes,
    links: selectedTypes.size > 0
      ? graphData.links.filter(l => {
          const sourceNode = graphData.nodes.find(n => n.id === l.source || (l.source as any).id === n.id)
          const targetNode = graphData.nodes.find(n => n.id === l.target || (l.target as any).id === n.id)
          return sourceNode && targetNode && selectedTypes.has(sourceNode.type) && selectedTypes.has(targetNode.type)
        })
      : graphData.links,
  } : null

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Knowledge Graph</h1>
            {stats && (
              <p className="text-muted-foreground">
                {stats.totalNodes} entities, {stats.totalLinks} connections
              </p>
            )}
          </div>
          {(centerId || selectedTypes.size > 0) && (
            <Button variant="outline" size="sm" onClick={resetGraph}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset View
            </Button>
          )}
        </div>

        {/* Type filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2 mr-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          {ENTITY_TYPES.map((type) => {
            const count = stats?.nodesByType[type.value] || 0
            const isSelected = selectedTypes.has(type.value)
            return (
              <Badge
                key={type.value}
                variant={isSelected ? 'default' : 'outline'}
                className="cursor-pointer"
                style={isSelected ? { backgroundColor: type.color } : undefined}
                onClick={() => toggleTypeFilter(type.value)}
              >
                <div
                  className="w-2 h-2 rounded-full mr-1"
                  style={{ backgroundColor: type.color }}
                />
                {type.label} ({count})
              </Badge>
            )
          })}
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="h-[600px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredData && filteredData.nodes.length > 0 ? (
              <KnowledgeGraph
                data={filteredData}
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                centerId={centerId}
              />
            ) : (
              <div className="h-[600px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">No entities yet</p>
                  <p className="text-sm">
                    Upload documents to automatically extract entities and see the knowledge graph.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {ENTITY_TYPES.map((type) => (
            <div key={type.value} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: type.color }}
              />
              <span>{type.label}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Click a node to view the entity. Double-click to center the graph on that entity.
        </p>
      </div>
    </div>
  )
}
