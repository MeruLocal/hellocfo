import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Play, Square, Trash2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

export default function ApiTestConsole() {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [finalResponse, setFinalResponse] = useState<string>("");
  const [executionTime, setExecutionTime] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const sendRequest = async () => {
    if (!query.trim()) {
      toast({ title: "Error", description: "Please enter a query", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setEvents([]);
    setFinalResponse("");
    setExecutionTime("");

    const startTime = Date.now();
    abortControllerRef.current = new AbortController();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({ title: "Error", description: "Please login to test the API", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cfo-agent-api`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            query: query.trim(),
            conversationHistory: [],
            stream: true,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
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
  };

  const copyResponse = () => {
    navigator.clipboard.writeText(finalResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getEventBadgeVariant = (type: string) => {
    switch (type) {
      case "complete": return "default";
      case "error": return "destructive";
      case "response_chunk": return "secondary";
      default: return "outline";
    }
  };

  const sampleQueries = [
    "Give me all customers",
    "Show me unpaid invoices",
    "What is my total revenue?",
    "List overdue payments",
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">API Test Console</h1>
            <p className="text-muted-foreground mt-1">
              Test the CFO Agent API with real-time SSE streaming
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            POST /functions/v1/cfo-agent-api
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Request Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Request</CardTitle>
              <CardDescription>Enter your query to test the API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Query</label>
                <Input
                  placeholder="e.g., Give me all customers"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !isLoading && sendRequest()}
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">Try:</span>
                {sampleQueries.map((q) => (
                  <Badge
                    key={q}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80 text-xs"
                    onClick={() => setQuery(q)}
                  >
                    {q}
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                {isLoading ? (
                  <Button variant="destructive" onClick={cancelRequest} className="flex-1">
                    <Square className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                ) : (
                  <Button onClick={sendRequest} className="flex-1">
                    <Play className="h-4 w-4 mr-2" />
                    Send Request
                  </Button>
                )}
                <Button variant="outline" onClick={clearConsole}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {executionTime && (
                <div className="text-sm text-muted-foreground">
                  Execution time: <span className="font-mono text-foreground">{executionTime}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Response Panel */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Response</CardTitle>
                <CardDescription>Final response from the API</CardDescription>
              </div>
              {finalResponse && (
                <Button variant="ghost" size="sm" onClick={copyResponse}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] rounded-md border bg-muted/30 p-4">
                {finalResponse ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground">
                    {finalResponse}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {isLoading ? "Waiting for response..." : "Send a request to see the response"}
                  </p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Events Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SSE Events Log</CardTitle>
            <CardDescription>
              Real-time stream of events from the API ({events.length} events)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-md border bg-muted/30">
              {events.length === 0 ? (
                <p className="text-muted-foreground text-sm p-4">
                  No events yet. Send a request to see the event stream.
                </p>
              ) : (
                <div className="p-2 space-y-2">
                  {events.map((event, index) => (
                    <div key={index} className="rounded-md border bg-background p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={getEventBadgeVariant(event.type)}>
                          {event.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <Separator className="my-2" />
                      <Textarea
                        readOnly
                        value={JSON.stringify(event.data, null, 2)}
                        className="font-mono text-xs min-h-[60px] bg-muted/50 border-0 resize-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
