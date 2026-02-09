import React, { useState, useMemo } from 'react';
import { Search, Download, FileText, FileSpreadsheet, ListOrdered } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  TEST_CASES,
  TEST_CASE_CATEGORIES,
  generateMarkdown,
  generateCSV,
  downloadFile,
  type TestCase
} from '@/data/testCases';

export function CasesLibraryView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const filteredCases = useMemo(() => {
    return TEST_CASES.filter(tc => {
      const matchesSearch = !searchTerm ||
        tc.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tc.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tc.subCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tc.expectedBehavior.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || tc.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, filterCategory]);

  const handleDownloadMD = () => {
    const md = generateMarkdown(filteredCases);
    downloadFile(md, 'cfo-test-cases.md', 'text/markdown');
  };

  const handleDownloadCSV = () => {
    const csv = generateCSV(filteredCases);
    downloadFile(csv, 'cfo-test-cases.csv', 'text/csv');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ListOrdered size={24} className="text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Cases Library</h2>
            <Badge variant="secondary">{filteredCases.length} / {TEST_CASES.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadMD}>
              <FileText size={16} />
              Markdown
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadCSV}>
              <FileSpreadsheet size={16} />
              CSV / Excel
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search test cases..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {TEST_CASE_CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead className="w-[140px]">Category</TableHead>
              <TableHead className="w-[130px]">Sub-Category</TableHead>
              <TableHead>Test Prompt</TableHead>
              <TableHead className="w-[300px]">Expected Behavior</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCases.map(tc => (
              <TableRow key={tc.id}>
                <TableCell className="text-muted-foreground font-mono text-xs">{tc.id}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{tc.category}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{tc.subCategory}</TableCell>
                <TableCell className="font-medium text-sm">{tc.prompt}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{tc.expectedBehavior}</TableCell>
              </TableRow>
            ))}
            {filteredCases.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No test cases match your search criteria
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
