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
import { Save, Trash2, RefreshCw, Loader2, Globe, Cog, Search, Network, AlertTriangle, MessageSquare, RotateCcw, Download, Cpu, Share2, Copy, Check, ExternalLink } from 'lucide-react'
import { ExportDialog } from '@/components/campaigns/export-dialog'
import { getCampaignSettings, DEFAULT_SETTINGS, AGGRESSIVENESS_OPTIONS, CHUNK_SIZE_OPTIONS, LINK_LABEL_OPTIONS, DEFAULT_PROMPTS, CHAT_MODEL_OPTIONS, EXTRACTION_MODEL_OPTIONS } from '@/lib/campaign-settings'
import type { CampaignSettings } from '@/lib/db/schema'
import { getModelProvider } from '@/lib/db/schema'

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
  isPublic: boolean | null
  publicSlug: string | null
}

export default function SettingsPage() {
  const params = useParams<{ campaignId: string }>()
  const campaignId = params.campaignId
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('en')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [isPublic, setIsPublic] = useState(false)
  const [publicSlug, setPublicSlug] = useState('')
  const [slugError, setSlugError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
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
        setIsPublic(data.isPublic || false)
        setPublicSlug(data.publicSlug || '')
      }
      setLoading(false)
    }

    loadData()
  }, [campaignId])

  // Generate slug from campaign name
  const generateSlug = () => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
    setPublicSlug(slug)
    setSlugError(null)
  }

  // Validate slug format
  const validateSlug = (slug: string) => {
    if (!slug) {
      setSlugError(null)
      return
    }
    if (slug.length < 3) {
      setSlugError('Slug must be at least 3 characters')
      return
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
      setSlugError('Slug can only contain lowercase letters, numbers, and hyphens')
      return
    }
    if (/--/.test(slug)) {
      setSlugError('Slug cannot contain consecutive hyphens')
      return
    }
    setSlugError(null)
  }

  // Copy public URL to clipboard
  const copyPublicUrl = async () => {
    const url = `${window.location.origin}/public/${publicSlug}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({
      title: 'Copied!',
      description: 'Public URL copied to clipboard',
    })
  }

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

  const updateModelSetting = <K extends keyof typeof settings.model>(
    key: K,
    value: typeof settings.model[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      model: { ...prev.model, [key]: value },
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
      body: JSON.stringify({
        name,
        description,
        language,
        settings,
        isPublic,
        publicSlug: isPublic ? publicSlug : null,
      }),
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
          <TabsList className="w-full overflow-x-auto flex sm:grid sm:grid-cols-7 scrollbar-hide">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
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
                  <Share2 className="h-5 w-5" />
                  Public Sharing
                </CardTitle>
                <CardDescription>
                  Share your campaign wiki publicly with anyone
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Make Campaign Public</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow anyone to view your wiki without logging in
                    </p>
                  </div>
                  <Switch
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                  />
                </div>

                {isPublic && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="publicSlug">Public URL Slug</Label>
                      <div className="flex gap-2">
                        <Input
                          id="publicSlug"
                          value={publicSlug}
                          onChange={(e) => {
                            setPublicSlug(e.target.value.toLowerCase())
                            validateSlug(e.target.value.toLowerCase())
                          }}
                          placeholder="my-campaign"
                          className={slugError ? 'border-destructive' : ''}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={generateSlug}
                        >
                          Generate
                        </Button>
                      </div>
                      {slugError && (
                        <p className="text-sm text-destructive">{slugError}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        URL-friendly name (lowercase letters, numbers, and hyphens)
                      </p>
                    </div>

                    {publicSlug && !slugError && (
                      <div className="space-y-2">
                        <Label>Shareable Link</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/public/${publicSlug}`}
                            className="bg-muted"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={copyPublicUrl}
                          >
                            {copied ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <a
                            href={`/public/${publicSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button type="button" variant="outline">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                      <p className="font-medium mb-1">What&apos;s visible publicly:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Wiki entities (non-DM-only)</li>
                        <li>Knowledge graph connections</li>
                        <li>Session notes (non-DM-only)</li>
                      </ul>
                      <p className="mt-2">DM-only content is always hidden from public view.</p>
                    </div>
                  </>
                )}
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

          {/* AI Models Tab */}
          <TabsContent value="models">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  AI Model Selection
                </CardTitle>
                <CardDescription>
                  Choose which AI models to use for different operations.
                  Some models require specific API keys to be configured.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Chat Model Selection */}
                <div className="space-y-3">
                  <Label>Chat Model</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Used for AI chat responses and campaign summaries.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CHAT_MODEL_OPTIONS.map((option) => {
                      const provider = getModelProvider(option.value)
                      const isSelected = settings.model.chatModel === option.value
                      return (
                        <button
                          key={option.value}
                          onClick={() => updateModelSetting('chatModel', option.value)}
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{option.label}</p>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              provider === 'anthropic'
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>
                              {provider === 'anthropic' ? 'Anthropic' : 'Google'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {option.description}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Extraction Model Selection */}
                <div className="space-y-3 pt-4 border-t">
                  <Label>Extraction Model</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Used for entity extraction from documents and notes. Faster models are recommended for bulk extraction.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EXTRACTION_MODEL_OPTIONS.map((option) => {
                      const provider = getModelProvider(option.value)
                      const isSelected = settings.model.extractionModel === option.value
                      return (
                        <button
                          key={option.value}
                          onClick={() => updateModelSetting('extractionModel', option.value)}
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{option.label}</p>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              provider === 'anthropic'
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>
                              {provider === 'anthropic' ? 'Anthropic' : 'Google'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {option.description}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* API Key Status */}
                <div className="space-y-3 pt-4 border-t">
                  <Label>Provider Status</Label>
                  <p className="text-sm text-muted-foreground">
                    API keys are configured in environment variables on the server.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm">
                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                      Anthropic (Claude)
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Google (Gemini)
                    </div>
                  </div>
                </div>
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
