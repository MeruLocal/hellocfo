import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Play, Square, Trash2, Copy, Check, ChevronDown, ChevronRight, 
  Settings, Send, Clock, Zap, AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface RequestConfig {
  method: string;
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  stream: boolean;
}

export default function ApiConsole() {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [finalResponse, setFinalResponse] = useState<string>("");
  const [executionTime, setExecutionTime] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("params");
  const [conversationHistory, setConversationHistory] = useState<string>("[]");
  const [conversationId, setConversationId] = useState("");
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [rawResponse, setRawResponse] = useState<string>("");
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  
  // Editable auth headers
  const [authToken, setAuthToken] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
  const [useSessionToken, setUseSessionToken] = useState(true);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const endpoint = "/functions/v1/cfo-agent-api";

  const sendRequest = async () => {
    if (!query.trim()) {
      toast({ title: "Error", description: "Please enter a query", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setEvents([]);
    setFinalResponse("");
    setExecutionTime("");
    setRawResponse("");
    setStatusCode(null);
    setResponseHeaders({});

    const startTime = Date.now();
    abortControllerRef.current = new AbortController();

    try {
      let bearerToken = authToken;
      
      // If using session token, get it from Supabase
      if (useSessionToken) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast({ title: "Error", description: "Please login to test the API or provide a custom token", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        bearerToken = session.access_token;
      } else if (!authToken.trim()) {
        toast({ title: "Error", description: "Please provide an Authorization token", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!apiKey.trim()) {
        toast({ title: "Error", description: "Please provide an API key", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const requestBody = {
        query: query.trim(),
        conversationHistory: JSON.parse(conversationHistory || "[]"),
        ...(conversationId && { conversationId }),
        stream: streamEnabled,
      };

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${bearerToken}`,
          "apikey": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      setStatusCode(response.status);
      
      // Capture response headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      setResponseHeaders(headers);

      if (!response.ok) {
        const errorText = await response.text();
        setRawResponse(errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";
      let fullRawResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullRawResponse += chunk;
        buffer += chunk;
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6));
              setEvents((prev) => [...prev, eventData]);

              if (eventData.type === "complete" && eventData.data?.response) {
                setFinalResponse(eventData.data.response);
                setExecutionTime(eventData.data.executionTime || `${((Date.now() - startTime) / 1000).toFixed(2)}s`);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      setRawResponse(fullRawResponse);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast({
          title: "Request Failed",
          description: (error as Error).message,
          variant: "destructive",
        });
        setEvents((prev) => [...prev, {
          type: "error",
          data: { message: (error as Error).message },
          timestamp: new Date().toISOString(),
        }]);
      }
    } finally {
      setIsLoading(false);
      if (!executionTime) {
        setExecutionTime(`${((Date.now() - startTime) / 1000).toFixed(2)}s`);
      }
    }
  };

  const cancelRequest = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  };

  const clearConsole = () => {
    setEvents([]);
    setFinalResponse("");
    setExecutionTime("");
    setRawResponse("");
    setStatusCode(null);
    setResponseHeaders({});
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleEventExpand = (index: number) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const getEventBadgeClass = (type: string) => {
    switch (type) {
      case "complete": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "error": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "response_chunk": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "tool_result": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "intent_detected": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  const getStatusBadge = () => {
    if (!statusCode) return null;
    const isSuccess = statusCode >= 200 && statusCode < 300;
    return (
      <Badge className={isSuccess ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
        {statusCode} {isSuccess ? "OK" : "Error"}
      </Badge>
    );
  };

  const sampleQueries = [
    "Give me all customers",
    "Show me unpaid invoices",
    "What is my total revenue?",
    "List overdue payments",
    "Show cash balance",
  ];

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">API Console</h2>
          <Badge variant="outline" className="text-xs font-mono border-slate-600 text-slate-400">
            POST
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          {executionTime && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Clock size={14} />
              <span className="font-mono">{executionTime}</span>
            </div>
          )}
          {getStatusBadge()}
        </div>
      </div>

      {/* URL Bar */}
      <div className="p-4 border-b border-slate-700 bg-slate-800/50">
        <div className="flex gap-2">
          <Select defaultValue="POST" disabled>
            <SelectTrigger className="w-24 bg-slate-700 border-slate-600 text-green-400 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="POST">POST</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={`${baseUrl}${endpoint}`}
            readOnly
            className="flex-1 bg-slate-700 border-slate-600 font-mono text-sm text-slate-300"
          />
          {isLoading ? (
            <Button variant="destructive" onClick={cancelRequest} className="w-24">
              <Square size={14} className="mr-1" /> Stop
            </Button>
          ) : (
            <Button onClick={sendRequest} className="w-24 bg-blue-600 hover:bg-blue-700">
              <Send size={14} className="mr-1" /> Send
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Request */}
        <div className="w-1/2 border-r border-slate-700 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-4 bg-slate-800 border border-slate-700">
              <TabsTrigger value="params" className="data-[state=active]:bg-slate-700">
                Body
              </TabsTrigger>
              <TabsTrigger value="headers" className="data-[state=active]:bg-slate-700">
                Headers
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-slate-700">
                <Settings size={14} className="mr-1" /> Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="params" className="flex-1 p-4 overflow-auto">
              <div className="space-y-4">
                {/* Query Input */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Query *</Label>
                  <Input
                    placeholder="e.g., Give me all customers"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !isLoading && sendRequest()}
                    disabled={isLoading}
                    className="bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500"
                  />
                  <div className="flex flex-wrap gap-1">
                    {sampleQueries.map((q) => (
                      <Badge
                        key={q}
                        variant="outline"
                        className="cursor-pointer hover:bg-slate-700 text-xs border-slate-600 text-slate-400"
                        onClick={() => setQuery(q)}
                      >
                        {q}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Conversation History */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Conversation History (JSON Array)</Label>
                  <Textarea
                    placeholder='[{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]'
                    value={conversationHistory}
                    onChange={(e) => setConversationHistory(e.target.value)}
                    className="bg-slate-800 border-slate-600 font-mono text-xs min-h-[80px] text-slate-100 placeholder:text-slate-500"
                  />
                </div>

                {/* Conversation ID */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Conversation ID (optional)</Label>
                  <Input
                    placeholder="uuid-conversation-id"
                    value={conversationId}
                    onChange={(e) => setConversationId(e.target.value)}
                    className="bg-slate-800 border-slate-600 font-mono text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </div>

                {/* Stream Toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <div className="space-y-0.5">
                    <Label className="text-slate-300">Enable SSE Streaming</Label>
                    <p className="text-xs text-slate-500">Receive real-time events</p>
                  </div>
                  <Switch
                    checked={streamEnabled}
                    onCheckedChange={setStreamEnabled}
                  />
                </div>

                {/* Request Preview */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300">
                    <ChevronRight size={14} className="transition-transform data-[state=open]:rotate-90" />
                    Request Body Preview
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="mt-2 p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto">
                      {JSON.stringify({
                        query: query || "<your query>",
                        conversationHistory: JSON.parse(conversationHistory || "[]"),
                        ...(conversationId && { conversationId }),
                        stream: streamEnabled,
                      }, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </TabsContent>

            <TabsContent value="headers" className="flex-1 p-4 overflow-auto">
              <div className="space-y-4">
                {/* Use Session Toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <div className="space-y-0.5">
                    <Label className="text-slate-300">Use Session Token</Label>
                    <p className="text-xs text-slate-500">Auto-fetch from current session</p>
                  </div>
                  <Switch
                    checked={useSessionToken}
                    onCheckedChange={setUseSessionToken}
                  />
                </div>

                {/* Authorization Token */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Authorization (Bearer Token)</Label>
                  <Textarea
                    placeholder={useSessionToken ? "Using session token automatically..." : "Enter your Bearer token here"}
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    disabled={useSessionToken}
                    className="bg-slate-800 border-slate-600 font-mono text-xs min-h-[80px] text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
                  />
                  {useSessionToken && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <Check size={12} /> Token will be fetched from your current session
                    </p>
                  )}
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <Label className="text-slate-300">API Key (apikey header)</Label>
                  <Input
                    placeholder="Enter your API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="bg-slate-800 border-slate-600 font-mono text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <p className="text-xs text-slate-500">
                    Default: Supabase anonymous key
                  </p>
                </div>

                {/* Content-Type (readonly) */}
                <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-300">Content-Type</span>
                    <code className="text-xs bg-slate-900 px-2 py-1 rounded text-slate-400">application/json</code>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="flex-1 p-4 overflow-auto">
              <div className="space-y-4">
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-300">Endpoint Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Base URL</span>
                      <code className="text-slate-300">{baseUrl}</code>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Path</span>
                      <code className="text-slate-300">{endpoint}</code>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Method</span>
                      <code className="text-green-400">POST</code>
                    </div>
                  </CardContent>
                </Card>
                
                <Button variant="outline" onClick={clearConsole} className="w-full border-slate-600 hover:bg-slate-700">
                  <Trash2 size={14} className="mr-2" /> Clear Response
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Response */}
        <div className="w-1/2 flex flex-col">
          <Tabs defaultValue="events" className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-4 bg-slate-800 border border-slate-700">
              <TabsTrigger value="events" className="data-[state=active]:bg-slate-700">
                Events <Badge variant="secondary" className="ml-1 text-xs">{events.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="response" className="data-[state=active]:bg-slate-700">
                Response
              </TabsTrigger>
              <TabsTrigger value="raw" className="data-[state=active]:bg-slate-700">
                Raw
              </TabsTrigger>
              <TabsTrigger value="headers" className="data-[state=active]:bg-slate-700">
                Headers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="events" className="flex-1 overflow-hidden p-4">
              <ScrollArea className="h-full">
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Zap size={40} className="mb-3 opacity-50" />
                    <p className="text-sm">No events yet</p>
                    <p className="text-xs">Send a request to see SSE events</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {events.map((event, index) => (
                      <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                        <button
                          onClick={() => toggleEventExpand(index)}
                          className="w-full p-3 flex items-center justify-between hover:bg-slate-750 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {expandedEvents.has(index) ? (
                              <ChevronDown size={14} className="text-slate-500" />
                            ) : (
                              <ChevronRight size={14} className="text-slate-500" />
                            )}
                            <Badge className={`${getEventBadgeClass(event.type)} border text-xs`}>
                              {event.type}
                            </Badge>
                            <span className="text-xs text-slate-500 font-mono">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(JSON.stringify(event.data, null, 2), `event-${index}`);
                            }}
                          >
                            {copied === `event-${index}` ? (
                              <Check size={12} className="text-green-400" />
                            ) : (
                              <Copy size={12} className="text-slate-500" />
                            )}
                          </Button>
                        </button>
                        {expandedEvents.has(index) && (
                          <div className="px-3 pb-3">
                            <Separator className="mb-3 bg-slate-700" />
                            <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded overflow-x-auto max-h-[200px]">
                              {JSON.stringify(event.data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="response" className="flex-1 overflow-hidden p-4">
              <ScrollArea className="h-full">
                {finalResponse ? (
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-0 right-0"
                      onClick={() => copyToClipboard(finalResponse, "response")}
                    >
                      {copied === "response" ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                    <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-slate-200 pr-10">
                      {finalResponse}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Play size={40} className="mb-3 opacity-50" />
                    <p className="text-sm">No response yet</p>
                    <p className="text-xs">Send a request to see the response</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="raw" className="flex-1 overflow-hidden p-4">
              <ScrollArea className="h-full">
                {rawResponse ? (
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 z-10"
                      onClick={() => copyToClipboard(rawResponse, "raw")}
                    >
                      {copied === "raw" ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                    <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded overflow-x-auto">
                      {rawResponse}
                    </pre>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <p className="text-sm">No raw response yet</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="headers" className="flex-1 overflow-hidden p-4">
              <ScrollArea className="h-full">
                {Object.keys(responseHeaders).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(responseHeaders).map(([key, value]) => (
                      <div key={key} className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-slate-300">{key}</span>
                          <code className="text-xs bg-slate-900 px-2 py-1 rounded text-slate-400 max-w-[300px] truncate">
                            {value}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <p className="text-sm">No response headers yet</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
