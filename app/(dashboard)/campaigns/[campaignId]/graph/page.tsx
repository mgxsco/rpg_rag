'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { CampaignGraph } from '@/components/graph/campaign-graph'
import { Card, CardContent } from '@/components/ui/card'
import { GraphData } from '@/lib/types'
import { Loader2 } from 'lucide-react'

export default function GraphPage({
  params,
}: {
  params: { campaignId: string }
}) {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDM, setIsDM] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const loadGraphData = async () => {
      try {
        const response = await fetch(`/api/campaigns/${params.campaignId}/graph`)
        const data = await response.json()
        setGraphData(data.graphData)
        setIsDM(data.isDM)
      } catch (error) {
        console.error('Failed to load graph data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadGraphData()
  }, [params.campaignId])

  const handleNodeClick = (nodeId: string) => {
    const node = graphData?.nodes.find((n) => n.id === nodeId)
    if (node) {
      router.push(`/campaigns/${params.campaignId}/notes/${node.slug}`)
    }
  }

  return (
    <div className="flex gap-6">
      <CampaignSidebar campaignId={params.campaignId} isDM={isDM} />

      <div className="flex-1">
        <h1 className="text-2xl font-bold mb-6">Knowledge Graph</h1>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="h-[600px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : graphData && graphData.nodes.length > 0 ? (
              <CampaignGraph
                data={graphData}
                onNodeClick={handleNodeClick}
              />
            ) : (
              <div className="h-[600px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">No connections yet</p>
                  <p className="text-sm">
                    Create notes and link them with [[wikilinks]] to see the graph.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Session</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>NPC</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span>Location</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span>Item</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500" />
            <span>Lore</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-500" />
            <span>Quest</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span>Faction</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500" />
            <span>Player Character</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-500" />
            <span>Freeform</span>
          </div>
        </div>
      </div>
    </div>
  )
}
