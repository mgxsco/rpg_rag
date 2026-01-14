'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { CampaignSidebar } from '@/components/campaigns/campaign-sidebar'
import { useToast } from '@/components/ui/use-toast'
import { Save, Trash2, RefreshCw, Loader2, Globe, Cog, Search, Network, AlertTriangle, MessageSquare, RotateCcw, Download } from 'lucide-react'
import { ExportDialog } from '@/components/campaigns/export-dialog'
import { getCampaignSettings, DEFAULT_SETTINGS, AGGRESSIVENESS_OPTIONS, CHUNK_SIZE_OPTIONS, LINK_LABEL_OPTIONS, DEFAULT_PROMPTS } from '@/lib/campaign-settings'
import type { CampaignSettings } from '@/lib/db/schema'

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'pl', label: 'Polish' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
]

interface Campaign {
  id: string
  name: string
  description: string | null
  language: string
  settings: CampaignSettings | null
}

export default function SettingsPage() {
  const params = useParams<{ campaignId: string }>()
  const campaignId = params.campaignId
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('en')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const loadData = async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`)
      if (res.ok) {
        const data = await res.json()
        setCampaign(data)
        setName(data.name)
        setDescription(data.description || '')
        setLanguage(data.language || 'en')
        setSettings(getCampaignSettings(data.settings))
      }
      setLoading(false)
    }

    loadData()
  }, [campaignId])

  const updateExtractionSetting = <K extends keyof typeof settings.extraction>(
    key: K,
    value: typeof settings.extraction[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      extraction: { ...prev.extraction, [key]: value },
    }))
  }

  const updateSearchSetting = <K extends keyof typeof settings.search>(
    key: K,
    value: typeof settings.search[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      search: { ...prev.search, [key]: value },
    }))
  }

  const updateGraphSetting = <K extends keyof typeof settings.graph>(
    key: K,
    value: typeof settings.graph[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      graph: { ...prev.graph, [key]: value },
    }))
  }

  const updateVisibilitySetting = <K extends keyof typeof settings.visibility>(
    key: K,
    value: typeof settings.visibility[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      visibility: { ...prev.visibility, [key]: value },
    }))
  }

  const updatePromptsSetting = <K extends keyof typeof settings.prompts>(
    key: K,
    value: typeof settings.prompts[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      prompts: { ...prev.prompts, [key]: value },
    }))
  }

  const resetPromptToDefault = (key: keyof typeof DEFAULT_PROMPTS) => {
    updatePromptsSetting(key, DEFAULT_PROMPTS[key])
  }

  const handleSave = async () => {
    setSaving(true)

    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, language, settings }),
    })

    if (!res.ok) {
      const data = await res.json()
      toast({
        title: 'Error',
        description: data.error || 'Failed to update campaign',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Success',
        description: 'Campaign settings saved!',
      })
    }

    setSaving(false)
  }

  const handleReindex = async () => {
    setReindexing(true)

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/reindex`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Error',
          description: data.error || 'Failed to reindex notes',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Reindex Complete',
          description: data.message,
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reindex notes',
        variant: 'destructive',
      })
    }

    setReindexing(false)
  }

  const handleDelete = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const data = await res.json()
      toast({
        title: 'Error',
        description: data.error || 'Failed to delete campaign',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Success',
        description: 'Campaign deleted',
      })
      router.push('/campaigns')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row gap-6">
        <CampaignSidebar campaignId={campaignId} isDM={true} />
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <CampaignSidebar campaignId={campaignId} isDM={true} />

      <div className="flex-1 min-w-0 max-w-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold">Campaign Settings</h1>
          <Button onClick={handleSave} disabled={saving} size="sm" className="sm:size-default">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save All'}
          </Button>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="w-full overflow-x-auto flex sm:grid sm:grid-cols-6 scrollbar-hide">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="extraction">Extraction</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="danger">Danger</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  General Settings
                </CardTitle>
                <CardDescription>Basic campaign information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Campaign Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    This language is used for AI entity extraction and descriptions.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Data Management
                </CardTitle>
                <CardDescription>Export or backup your campaign data</CardDescription>
              </CardHeader>
              <CardContent>
                <ExportDialog campaignId={campaignId} campaignName={name} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Extraction Tab */}
          <TabsContent value="extraction">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cog className="h-5 w-5" />
                  AI Extraction Settings
                </CardTitle>
                <CardDescription>
                  Configure how the AI extracts entities from your documents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Aggressiveness */}
                <div className="space-y-3">
                  <Label>Extraction Aggressiveness</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {AGGRESSIVENESS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateExtractionSetting('aggressiveness', option.value)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          settings.extraction.aggressiveness === option.value
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <p className="font-medium">{option.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {option.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chunk Size */}
                <div className="space-y-3">
                  <Label>Document Chunk Size</Label>
                  <Select
                    value={settings.extraction.chunkSize.toString()}
                    onValueChange={(v) => updateExtractionSetting('chunkSize', parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHUNK_SIZE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Smaller chunks provide more detailed extraction but take longer to process.
                  </p>
                </div>

                {/* Confidence Threshold */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Confidence Threshold</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {settings.extraction.confidenceThreshold.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[settings.extraction.confidenceThreshold]}
                    onValueChange={([v]) => updateExtractionSetting('confidenceThreshold', v)}
                    min={0.3}
                    max={1.0}
                    step={0.05}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0.3 (lenient)</span>
                    <span>1.0 (strict)</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Lower values extract more entities with less certainty.
                  </p>
                </div>

                {/* Toggles */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Relationship Extraction</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically detect relationships between entities
                      </p>
                    </div>
                    <Switch
                      checked={settings.extraction.enableRelationships}
                      onCheckedChange={(v) => updateExtractionSetting('enableRelationships', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Auto-Merge</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically merge similar entities (e.g., &quot;Grim&quot; + &quot;Grimlock&quot;)
                      </p>
                    </div>
                    <Switch
                      checked={settings.extraction.enableAutoMerge}
                      onCheckedChange={(v) => updateExtractionSetting('enableAutoMerge', v)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Search Tab */}
          <TabsContent value="search">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Search & Chat Settings
                </CardTitle>
                <CardDescription>
                  Configure RAG search and AI chat behavior
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Similarity Threshold */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Similarity Threshold</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {settings.search.similarityThreshold.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[settings.search.similarityThreshold]}
                    onValueChange={([v]) => updateSearchSetting('similarityThreshold', v)}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0.1 (more results)</span>
                    <span>0.9 (strict matching)</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Controls how closely search results must match your query.
                  </p>
                </div>

                {/* Result Limit */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Max Search Results</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {settings.search.resultLimit}
                    </span>
                  </div>
                  <Slider
                    value={[settings.search.resultLimit]}
                    onValueChange={([v]) => updateSearchSetting('resultLimit', v)}
                    min={4}
                    max={20}
                    step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>4 results</span>
                    <span>20 results</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Number of context chunks to include in AI chat responses.
                  </p>
                </div>

                {/* Player Access */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Player Chat Access</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow players to use the AI chat (they won&apos;t see DM-only content)
                      </p>
                    </div>
                    <Switch
                      checked={settings.search.enablePlayerChat}
                      onCheckedChange={(v) => updateSearchSetting('enablePlayerChat', v)}
                    />
                  </div>
                </div>

                {/* Reindex Section */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Regenerate Embeddings</Label>
                      <p className="text-sm text-muted-foreground">
                        Reindex all entities for AI search. Use if search isn&apos;t working.
                      </p>
                    </div>
                    <Button onClick={handleReindex} disabled={reindexing} variant="outline" size="sm">
                      {reindexing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      {reindexing ? 'Reindexing...' : 'Reindex'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prompts Tab */}
          <TabsContent value="prompts">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  AI Prompt Customization
                </CardTitle>
                <CardDescription>
                  Customize the prompts used by the AI for chat and entity extraction.
                  Changes affect new interactions only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Chat System Prompt */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="chatSystemPrompt">Chat System Prompt</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resetPromptToDefault('chatSystemPrompt')}
                      title="Reset to default"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    id="chatSystemPrompt"
                    value={settings.prompts.chatSystemPrompt}
                    onChange={(e) => updatePromptsSetting('chatSystemPrompt', e.target.value)}
                    rows={8}
                    className="font-mono text-sm"
                    placeholder="Enter the system prompt for the AI chat..."
                  />
                  <p className="text-sm text-muted-foreground">
                    This prompt instructs the AI how to respond to questions about your campaign.
                  </p>
                </div>

                {/* Extraction Prompts - Accordion style */}
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label className="text-base">Entity Extraction Prompts</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      These prompts control how the AI extracts entities from uploaded documents.
                      Each aggressiveness level has its own prompt.
                    </p>
                  </div>

                  {/* Conservative Prompt */}
                  <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="extractionConservativePrompt" className="font-medium">
                        Conservative Mode Prompt
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resetPromptToDefault('extractionConservativePrompt')}
                        title="Reset to default"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      id="extractionConservativePrompt"
                      value={settings.prompts.extractionConservativePrompt}
                      onChange={(e) => updatePromptsSetting('extractionConservativePrompt', e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used when extraction is set to &quot;Conservative&quot; - focuses on high-confidence entities.
                    </p>
                  </div>

                  {/* Balanced Prompt */}
                  <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="extractionBalancedPrompt" className="font-medium">
                        Balanced Mode Prompt
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resetPromptToDefault('extractionBalancedPrompt')}
                        title="Reset to default"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      id="extractionBalancedPrompt"
                      value={settings.prompts.extractionBalancedPrompt}
                      onChange={(e) => updatePromptsSetting('extractionBalancedPrompt', e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used when extraction is set to &quot;Balanced&quot; - moderate extraction depth.
                    </p>
                  </div>

                  {/* Obsessive Prompt */}
                  <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="extractionObsessivePrompt" className="font-medium">
                        Obsessive Mode Prompt
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resetPromptToDefault('extractionObsessivePrompt')}
                        title="Reset to default"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      id="extractionObsessivePrompt"
                      value={settings.prompts.extractionObsessivePrompt}
                      onChange={(e) => updatePromptsSetting('extractionObsessivePrompt', e.target.value)}
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used when extraction is set to &quot;Obsessive&quot; - extracts every possible entity.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Graph Tab */}
          <TabsContent value="graph">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Knowledge Graph Settings
                </CardTitle>
                <CardDescription>
                  Configure the visual graph display
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Max Nodes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Maximum Nodes to Render</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {settings.graph.maxNodes}
                    </span>
                  </div>
                  <Slider
                    value={[settings.graph.maxNodes]}
                    onValueChange={([v]) => updateGraphSetting('maxNodes', v)}
                    min={50}
                    max={1000}
                    step={50}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>50 nodes</span>
                    <span>1000 nodes</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Higher values may impact browser performance with large graphs.
                  </p>
                </div>

                {/* Link Labels */}
                <div className="space-y-3">
                  <Label>Relationship Labels</Label>
                  <Select
                    value={settings.graph.showLinkLabels}
                    onValueChange={(v) => updateGraphSetting('showLinkLabels', v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINK_LABEL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    When to display relationship type labels on graph edges.
                  </p>
                </div>

                {/* Default DM Only */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Default New Entities to DM-Only</Label>
                      <p className="text-sm text-muted-foreground">
                        Newly extracted entities will be hidden from players by default
                      </p>
                    </div>
                    <Switch
                      checked={settings.visibility.defaultDmOnly}
                      onCheckedChange={(v) => updateVisibilitySetting('defaultDmOnly', v)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Danger Tab */}
          <TabsContent value="danger">
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible actions for your campaign
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Campaign
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Are you sure?</DialogTitle>
                      <DialogDescription>
                        This will permanently delete the campaign &quot;{campaign?.name}&quot; and all
                        its entities, documents, and relationships. This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={handleDelete}>
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
