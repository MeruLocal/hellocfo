CREATE OR REPLACE FUNCTION match_tools_from_registry(
  p_modules TEXT[],
  p_keywords TEXT[],
  p_exclude TEXT[] DEFAULT '{}',
  p_limit INT DEFAULT 20
) RETURNS TABLE(tool_name TEXT, module TEXT, match_source TEXT) AS $$
  SELECT tr.tool_name, tr.module,
    CASE WHEN tr.module = ANY(p_modules) THEN 'module' ELSE 'keyword' END as match_source
  FROM tool_registry tr
  WHERE tr.is_active = true
    AND (tr.module = ANY(p_modules) OR tr.keywords && p_keywords)
    AND tr.tool_name != ALL(p_exclude)
  ORDER BY
    CASE WHEN tr.module = ANY(p_modules) THEN 0 ELSE 1 END,
    tr.tool_name
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;