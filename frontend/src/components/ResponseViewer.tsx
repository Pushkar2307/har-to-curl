'use client';

import { ExecuteResponse } from '@/types/har';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ResponseViewerProps {
  response: ExecuteResponse;
}

function getStatusBadgeVariant(status: number): string {
  if (status >= 200 && status < 300) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (status >= 300 && status < 400) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function ResponseViewer({ response }: ResponseViewerProps) {
  const formattedBody = formatJson(response.body);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Response</CardTitle>
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="secondary" className={getStatusBadgeVariant(response.status)}>
              {response.status} {response.statusText}
            </Badge>
            <span className="text-muted-foreground">{response.duration}ms</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="body">
          <TabsList>
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="headers">
              Headers ({Object.keys(response.headers).length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="body">
            <ScrollArea className="h-[400px] rounded-md border">
              <pre className="p-4 text-xs font-mono leading-relaxed">
                <code>{formattedBody}</code>
              </pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="headers">
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4 space-y-1">
                {Object.entries(response.headers).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs font-mono">
                    <span className="font-medium text-foreground min-w-[180px]">
                      {key}:
                    </span>
                    <span className="text-muted-foreground break-all">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
