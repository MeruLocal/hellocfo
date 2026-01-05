import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Send, Square, Copy, Check, ChevronDown, ChevronRight, 
  Clock, Zap, Trash2, MoreHorizontal
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

export default function ApiConsole() {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [finalResponse, setFinalResponse] = useState<string>("");
  const [executionTime, setExecutionTime] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("body");
  const [responseTab, setResponseTab] = useState("events");
  const [conversationHistory, setConversationHistory] = useState<string>("[]");
  const [conversationId, setConversationId] = useState("");
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [rawResponse, setRawResponse] = useState<string>("");
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  
  // Auth headers
  const [authToken, setAuthToken] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
  const [useSessionToken, setUseSessionToken] = useState(true);
  
  // MCP credentials
  const [hAuthToken, setHAuthToken] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");
  const [orgId, setOrgId] = useState<string>("");
  
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
      
      if (useSessionToken) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast({ title: "Error", description: "Please login or provide a custom token", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        bearerToken = session.access_token;
      } else if (!authToken.trim()) {
        toast({ title: "Error", description: "Please provide an Authorization token", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const requestBody = {
        query: query.trim(),
        conversationHistory: JSON.parse(conversationHistory || "[]"),
        ...(conversationId && { conversationId }),
        stream: streamEnabled,
        ...(entityId.trim() && { entityId: entityId.trim() }),
        ...(orgId.trim() && { orgId: orgId.trim() }),
      };

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`,
        "apikey": apiKey,
      };
      
      if (hAuthToken.trim()) {
        requestHeaders["H-Authorization"] = hAuthToken.trim().startsWith("Bearer ") 
          ? hAuthToken.trim() 
          : `Bearer ${hAuthToken.trim()}`;
      }

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      setStatusCode(response.status);
      
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

      if (!reader) throw new Error("No response body");

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
        toast({ title: "Failed", description: (error as Error).message, variant: "destructive" });
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
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return newSet;
    });
  };

  const getEventBadge = (type: string) => {
    const styles: Record<string, string> = {
      complete: "bg-emerald-500/20 text-emerald-400",
      error: "bg-red-500/20 text-red-400",
      response_chunk: "bg-blue-500/20 text-blue-400",
      tool_result: "bg-violet-500/20 text-violet-400",
      intent_detected: "bg-amber-500/20 text-amber-400",
      mcp_connected: "bg-cyan-500/20 text-cyan-400",
      connected: "bg-green-500/20 text-green-400",
    };
    return styles[type] || "bg-slate-600/50 text-slate-400";
  };

  const StatusBadge = () => {
    if (!statusCode) return null;
    const isSuccess = statusCode >= 200 && statusCode < 300;
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isSuccess ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
        {statusCode}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-slate-200 text-sm">
      {/* Header Bar */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-[#333] bg-[#252526]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">CFO Agent API</span>
          <StatusBadge />
        </div>
        <div className="flex items-center gap-3">
          {executionTime && (
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <Clock size={10} />
              <span className="font-mono">{executionTime}</span>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={clearConsole} className="h-6 px-2 text-[10px] text-slate-400 hover:text-slate-200">
            <Trash2 size={10} className="mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* URL Bar */}
      <div className="h-11 px-3 flex items-center gap-2 border-b border-[#333] bg-[#2d2d2d]">
        <Select defaultValue="POST" disabled>
          <SelectTrigger className="w-20 h-7 bg-[#3c3c3c] border-[#555] text-emerald-400 text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#3c3c3c] border-[#555]">
            <SelectItem value="POST">POST</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={`${baseUrl}${endpoint}`}
          readOnly
          className="flex-1 h-7 bg-[#3c3c3c] border-[#555] font-mono text-xs text-slate-300"
        />
        {isLoading ? (
          <Button variant="destructive" onClick={cancelRequest} className="h-7 px-3 text-xs">
            <Square size={10} className="mr-1" /> Stop
          </Button>
        ) : (
          <Button onClick={sendRequest} className="h-7 px-4 bg-orange-500 hover:bg-orange-600 text-xs font-medium">
            <Send size={10} className="mr-1" /> Send
          </Button>
        )}
      </div>

      {/* Main Content - Horizontal Split */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel - Request Config */}
        <div className="w-[45%] min-w-[300px] border-r border-[#333] flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-[#333] bg-[#252526]">
              <TabsList className="h-8 bg-transparent p-0 gap-0">
                <TabsTrigger value="body" className="h-8 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent">
                  Body
                </TabsTrigger>
                <TabsTrigger value="headers" className="h-8 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent">
                  Headers
                </TabsTrigger>
                <TabsTrigger value="auth" className="h-8 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent">
                  Auth
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="body" className="flex-1 m-0 overflow-hidden min-h-0">
              <ScrollArea className="h-full [&>[data-radix-scroll-area-viewport]]:max-h-full">
                <div className="p-3 space-y-3 pb-6">
                  {/* Query */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">Query *</label>
                    <Input
                      placeholder="e.g., Give me all customers"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !isLoading && sendRequest()}
                      className="h-8 bg-[#3c3c3c] border-[#555] text-xs"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {["Give me all customers", "Show unpaid invoices", "Total revenue"].map((q) => (
                        <button
                          key={q}
                          onClick={() => setQuery(q)}
                          className="px-1.5 py-0.5 text-[10px] bg-[#3c3c3c] hover:bg-[#4c4c4c] rounded text-slate-400 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* MCP Credentials */}
                  <div className="space-y-2 pt-2 border-t border-[#333]">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-500">
                      <Zap size={10} />
                      MCP Credentials
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Entity ID</label>
                        <Input
                          placeholder="Entity ID"
                          value={entityId}
                          onChange={(e) => setEntityId(e.target.value)}
                          className="h-7 bg-[#3c3c3c] border-[#555] text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Org ID</label>
                        <Input
                          placeholder="Org ID"
                          value={orgId}
                          onChange={(e) => setOrgId(e.target.value)}
                          className="h-7 bg-[#3c3c3c] border-[#555] text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="flex items-center gap-4 pt-2 border-t border-[#333]">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <Switch checked={streamEnabled} onCheckedChange={setStreamEnabled} className="scale-75" />
                      <span>SSE Stream</span>
                    </label>
                  </div>

                  {/* Conversation History - Collapsed */}
                  <details className="pt-2 border-t border-[#333]">
                    <summary className="text-[10px] uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-400">
                      Advanced
                    </summary>
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Conversation ID</label>
                        <Input
                          placeholder="uuid"
                          value={conversationId}
                          onChange={(e) => setConversationId(e.target.value)}
                          className="h-7 bg-[#3c3c3c] border-[#555] text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">History (JSON)</label>
                        <Textarea
                          placeholder="[]"
                          value={conversationHistory}
                          onChange={(e) => setConversationHistory(e.target.value)}
                          className="bg-[#3c3c3c] border-[#555] text-xs font-mono min-h-[60px]"
                        />
                      </div>
                    </div>
                  </details>

                  {/* Request Preview */}
                  <details className="pt-2 border-t border-[#333]">
                    <summary className="text-[10px] uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-400">
                      Request Preview
                    </summary>
                    <pre className="mt-2 p-2 bg-[#1a1a1a] rounded text-[10px] font-mono text-slate-400 overflow-x-auto">
                      {JSON.stringify({
                        query: query || "<query>",
                        stream: streamEnabled,
                        ...(entityId && { entityId }),
                        ...(orgId && { orgId }),
                      }, null, 2)}
                    </pre>
                  </details>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="headers" className="flex-1 m-0 overflow-hidden min-h-0">
              <ScrollArea className="h-full [&>[data-radix-scroll-area-viewport]]:max-h-full">
                <div className="p-3 space-y-2">
                  {/* Static headers */}
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Request Headers</div>
                  
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 p-2 bg-[#2a2a2a] rounded text-xs">
                      <span className="text-slate-400 w-28">Content-Type</span>
                      <span className="font-mono text-slate-300">application/json</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-[#2a2a2a] rounded text-xs">
                      <span className="text-slate-400 w-28">Authorization</span>
                      <span className="font-mono text-emerald-400 truncate">Bearer {useSessionToken ? "(session)" : authToken.substring(0, 20) + "..."}</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-[#2a2a2a] rounded text-xs">
                      <span className="text-slate-400 w-28">apikey</span>
                      <span className="font-mono text-slate-300 truncate">{apiKey.substring(0, 30)}...</span>
                    </div>
                  </div>

                  {/* H-Authorization */}
                  <div className="pt-3 border-t border-[#333]">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-500 mb-2">
                      <Zap size={10} />
                      MCP Authorization
                    </div>
                    <Textarea
                      placeholder="Bearer token for HelloBooks MCP (optional)"
                      value={hAuthToken}
                      onChange={(e) => setHAuthToken(e.target.value)}
                      className="bg-[#3c3c3c] border-[#555] text-xs font-mono min-h-[60px]"
                    />
                    <p className="text-[10px] text-slate-600 mt-1">Sent as H-Authorization header</p>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="auth" className="flex-1 m-0 overflow-hidden min-h-0">
              <ScrollArea className="h-full [&>[data-radix-scroll-area-viewport]]:max-h-full">
                <div className="p-3 space-y-3">
                  {/* Session Toggle */}
                  <div className="flex items-center justify-between p-2 bg-[#2a2a2a] rounded">
                    <div>
                      <div className="text-xs text-slate-300">Use Session Token</div>
                      <div className="text-[10px] text-slate-500">Auto-fetch from login</div>
                    </div>
                    <Switch checked={useSessionToken} onCheckedChange={setUseSessionToken} className="scale-75" />
                  </div>

                  {/* Custom Token */}
                  {!useSessionToken && (
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Bearer Token</label>
                      <Textarea
                        placeholder="Enter your token"
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                        className="bg-[#3c3c3c] border-[#555] text-xs font-mono min-h-[80px]"
                      />
                    </div>
                  )}

                  {/* API Key */}
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">API Key</label>
                    <Input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-7 bg-[#3c3c3c] border-[#555] text-xs font-mono"
                    />
                    <p className="text-[10px] text-slate-600 mt-1">Supabase anon key</p>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Response */}
        <div className="flex-1 flex flex-col bg-[#1a1a1a] min-h-0">
          <Tabs value={responseTab} onValueChange={setResponseTab} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-[#333] bg-[#252526]">
              <TabsList className="h-8 bg-transparent p-0 gap-0">
                <TabsTrigger value="events" className="h-8 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent">
                  Events
                  {events.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-[#3c3c3c] rounded text-[10px] text-slate-400">{events.length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="body" className="h-8 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent">
                  Body
                </TabsTrigger>
                <TabsTrigger value="raw" className="h-8 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent">
                  Raw
                </TabsTrigger>
                <TabsTrigger value="headers" className="h-8 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent">
                  Headers
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="events" className="flex-1 m-0 overflow-hidden min-h-0">
              <ScrollArea className="h-full [&>[data-radix-scroll-area-viewport]]:max-h-full">
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                    <Zap size={24} className="mb-2 opacity-50" />
                    <p className="text-xs">No events yet</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {events.map((event, index) => (
                      <div key={index} className="bg-[#2a2a2a] rounded overflow-hidden">
                        <button
                          onClick={() => toggleEventExpand(index)}
                          className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-[#333] transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {expandedEvents.has(index) ? (
                              <ChevronDown size={10} className="text-slate-500" />
                            ) : (
                              <ChevronRight size={10} className="text-slate-500" />
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getEventBadge(event.type)}`}>
                              {event.type}
                            </span>
                            <span className="text-[10px] text-slate-600 font-mono">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(JSON.stringify(event.data, null, 2), `event-${index}`);
                            }}
                          >
                            {copied === `event-${index}` ? (
                              <Check size={10} className="text-emerald-400" />
                            ) : (
                              <Copy size={10} className="text-slate-500" />
                            )}
                          </Button>
                        </button>
                        {expandedEvents.has(index) && (
                          <pre className="px-2 pb-2 text-[10px] font-mono text-slate-400 overflow-x-auto">
                            {JSON.stringify(event.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="body" className="flex-1 m-0 overflow-hidden min-h-0">
              <ScrollArea className="h-full [&>[data-radix-scroll-area-viewport]]:max-h-full">
                {finalResponse ? (
                  <div className="p-3 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-6 w-6 p-0"
                      onClick={() => copyToClipboard(finalResponse, "response")}
                    >
                      {copied === "response" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </Button>
                    <div className="text-xs text-slate-300 whitespace-pre-wrap pr-8">
                      {finalResponse}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                    <MoreHorizontal size={24} className="mb-2 opacity-50" />
                    <p className="text-xs">No response body</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="raw" className="flex-1 m-0 overflow-hidden min-h-0">
              <ScrollArea className="h-full [&>[data-radix-scroll-area-viewport]]:max-h-full">
                {rawResponse ? (
                  <div className="p-2 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-6 w-6 p-0 z-10"
                      onClick={() => copyToClipboard(rawResponse, "raw")}
                    >
                      {copied === "raw" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </Button>
                    <pre className="text-[10px] font-mono text-slate-400 overflow-x-auto pr-8">
                      {rawResponse}
                    </pre>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                    <p className="text-xs">No raw response</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="headers" className="flex-1 m-0 overflow-hidden min-h-0">
              <ScrollArea className="h-full [&>[data-radix-scroll-area-viewport]]:max-h-full">
                {Object.keys(responseHeaders).length > 0 ? (
                  <div className="p-2 space-y-1">
                    {Object.entries(responseHeaders).map(([key, value]) => (
                      <div key={key} className="flex gap-2 p-1.5 bg-[#2a2a2a] rounded text-[10px]">
                        <span className="text-slate-400 font-medium min-w-[120px]">{key}</span>
                        <span className="font-mono text-slate-300 truncate">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                    <p className="text-xs">No response headers</p>
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
