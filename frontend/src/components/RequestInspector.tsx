'use client';

import { useState } from 'react';
import { CompactEntry } from '@/types/har';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface RequestInspectorProps {
  entries: CompactEntry[];
  allEntries: CompactEntry[];
  stats: { total: number; removed: number; kept: number } | null;
  highlightedIndex: number | null;
}

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'POST':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'PUT':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'DELETE':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'PATCH':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-600 dark:text-green-400';
  if (status >= 300 && status < 400) return 'text-yellow-600 dark:text-yellow-400';
  if (status >= 400) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function truncateUrl(url: string, maxLength = 80): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '...';
}

function RequestTable({
  entries,
  highlightedIndex,
}: {
  entries: CompactEntry[];
  highlightedIndex: number | null;
}) {
  return (
    <ScrollArea className="h-[300px] rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">#</TableHead>
            <TableHead className="w-[80px]">Method</TableHead>
            <TableHead>URL</TableHead>
            <TableHead className="w-[70px]">Status</TableHead>
            <TableHead className="w-[120px]">Type</TableHead>
            <TableHead className="w-[80px] text-right">Size</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow
              key={entry.index}
              className={
                highlightedIndex === entry.index
                  ? 'bg-primary/10 border-l-2 border-l-primary'
                  : ''
              }
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                {entry.index}
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={`font-mono text-xs ${getMethodColor(entry.method)}`}
                >
                  {entry.method}
                </Badge>
              </TableCell>
              <TableCell
                className="font-mono text-xs max-w-[400px] truncate"
                title={entry.url}
              >
                {truncateUrl(entry.url)}
              </TableCell>
              <TableCell
                className={`font-mono text-xs font-medium ${getStatusColor(entry.status)}`}
              >
                {entry.status}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                {entry.responseType}
              </TableCell>
              <TableCell className="text-xs text-right text-muted-foreground">
                {formatBytes(entry.responseSize)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

export function RequestInspector({
  entries,
  allEntries,
  stats,
  highlightedIndex,
}: RequestInspectorProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Request Inspector</CardTitle>
          {stats && (
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>{stats.total} total</span>
              <span>·</span>
              <span>{stats.removed} filtered out</span>
              <span>·</span>
              <span className="font-medium text-foreground">
                {stats.kept} API requests kept
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="filtered">
          <TabsList className="mb-3">
            <TabsTrigger value="filtered">
              API Requests ({entries.length})
            </TabsTrigger>
            <TabsTrigger value="all">
              All Requests ({allEntries.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="filtered">
            <RequestTable entries={entries} highlightedIndex={highlightedIndex} />
          </TabsContent>
          <TabsContent value="all">
            <RequestTable entries={allEntries} highlightedIndex={highlightedIndex} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
