import { supabase } from "@/integrations/supabase/client";

// Rate limits
const LIMITS = {
  TEMPLATES_PER_DAY: 10,        // Max template submissions per day
  TEMPLATES_PER_HOUR: 3,        // Max template submissions per hour
  MESSAGES_PER_HOUR: 100,       // Max messages per hour
  MESSAGES_PER_DAY: 1000,       // Max messages per day
  API_CALLS_PER_MINUTE: 30,     // Max API calls per minute
};

// Content validation patterns
const PROHIBITED_PATTERNS = {
  // Variables at start/end (Meta rejects these)
  VARIABLE_AT_START: /^\s*\{\{[0-9]+\}\}/,
  VARIABLE_AT_END: /\{\{[0-9]+\}\}\s*$/,
  
  // Emoji patterns (warn in UTILITY/AUTH)
  EMOJIS: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u,
  
  // URL patterns (must be from approved domains)
  SUSPICIOUS_URLS: /bit\.ly|tinyurl|goo\.gl|t\.co|shorturl/i,
  
  // Phone number patterns (avoid in templates)
  PHONE_NUMBERS: /\+?[1-9]\d{9,14}/,
};

export interface AIAnalysisResult {
  isProfessional: boolean;
  isHarmful: boolean;
  overallScore: number;
  issues: Array<{ type: string; severity: 'error' | 'warning' | 'info'; message: string }>;
  suggestions: string[];
  categoryAppropriate: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  blockedPatterns: string[];
  score: number; // 0-100, higher is better
  aiAnalysis?: AIAnalysisResult;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  reason?: string;
}

/**
 * Validate template content before submission to Meta
 */
export async function validateTemplateContent(
  content: string,
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockedPatterns: string[] = [];
  let score = 100;

  // 1. Check for prohibited patterns from database
  const { data: blockedContent } = await supabase
    .from("meta_blocked_content")
    .select("*")
    .eq("is_active", true);

  const upperContent = content.toUpperCase();

  blockedContent?.forEach((rule) => {
    const pattern = rule.pattern.toUpperCase();
    if (rule.pattern_type === 'keyword' && upperContent.includes(pattern)) {
      if (rule.severity === 'block') {
        errors.push(`Blocked content: "${rule.pattern}" - ${rule.description || rule.category}`);
        blockedPatterns.push(rule.pattern);
        score -= 30;
      } else {
        warnings.push(`Warning: "${rule.pattern}" - ${rule.description || 'May trigger review'}`);
        score -= 10;
      }
    } else if (rule.pattern_type === 'regex') {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(content)) {
        if (rule.severity === 'block') {
          errors.push(`Pattern blocked: ${rule.description || rule.category}`);
          blockedPatterns.push(rule.pattern);
          score -= 30;
        } else {
          warnings.push(`Pattern warning: ${rule.description || 'May trigger review'}`);
          score -= 10;
        }
      }
    }
  });

  // 2. Check variable placement
  if (PROHIBITED_PATTERNS.VARIABLE_AT_START.test(content)) {
    errors.push("Variables cannot be at the very start of the message");
    score -= 25;
  }
  if (PROHIBITED_PATTERNS.VARIABLE_AT_END.test(content)) {
    errors.push("Variables cannot be at the very end of the message");
    score -= 25;
  }

  // 3. Category-specific checks
  if (category === 'UTILITY' || category === 'AUTHENTICATION') {
    if (PROHIBITED_PATTERNS.EMOJIS.test(content)) {
      warnings.push("Emojis are discouraged in UTILITY/AUTHENTICATION templates");
      score -= 5;
    }
    
    // Check for promotional language
    const promotionalWords = ['free', 'discount', 'offer', 'sale', 'deal', 'limited'];
    promotionalWords.forEach(word => {
      if (upperContent.includes(word.toUpperCase())) {
        warnings.push(`Promotional language "${word}" may cause rejection in ${category} template`);
        score -= 10;
      }
    });
  }

  // 4. Check for suspicious URLs
  if (PROHIBITED_PATTERNS.SUSPICIOUS_URLS.test(content)) {
    errors.push("URL shorteners are not allowed - use full domain URLs");
    score -= 20;
  }

  // 5. Length checks
  if (content.length > 1024) {
    errors.push("Message body exceeds 1024 character limit");
    score -= 30;
  }
  if (content.length < 10) {
    warnings.push("Message is very short - may be rejected");
    score -= 10;
  }

  // 6. Variable count check
  const variableMatches = content.match(/\{\{[0-9]+\}\}/g);
  if (variableMatches && variableMatches.length > 10) {
    warnings.push("Too many variables (>10) may cause rejection");
    score -= 15;
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    blockedPatterns,
    score
  };
}

/**
 * AI-powered content analysis for professionalism and harmful content
 */
export async function analyzeTemplateWithAI(
  content: string,
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
  templateName?: string
): Promise<AIAnalysisResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-template-content', {
      body: { content, category, templateName }
    });

    if (error) {
      console.error('AI analysis error:', error);
      return null;
    }

    return data?.analysis || null;
  } catch (err) {
    console.error('AI analysis failed:', err);
    return null;
  }
}

/**
 * Check if action is within rate limits
 */
export async function checkRateLimit(
  actionType: 'template_submission' | 'message_send' | 'api_call'
): Promise<RateLimitResult> {
  const now = new Date();
  let windowMinutes: number;
  let limit: number;

  switch (actionType) {
    case 'template_submission':
      windowMinutes = 60;
      limit = LIMITS.TEMPLATES_PER_HOUR;
      break;
    case 'message_send':
      windowMinutes = 60;
      limit = LIMITS.MESSAGES_PER_HOUR;
      break;
    case 'api_call':
      windowMinutes = 1;
      limit = LIMITS.API_CALLS_PER_MINUTE;
      break;
  }

  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

  // Count actions in window
  const { count } = await supabase
    .from("meta_rate_limits")
    .select("*", { count: 'exact', head: true })
    .eq("action_type", actionType)
    .gte("created_at", windowStart.toISOString());

  const currentCount = count || 0;
  const remaining = Math.max(0, limit - currentCount);
  const resetAt = new Date(now.getTime() + windowMinutes * 60 * 1000);

  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      reason: `Rate limit exceeded: ${currentCount}/${limit} ${actionType} in ${windowMinutes} minutes`
    };
  }

  return {
    allowed: true,
    remaining,
    resetAt
  };
}

/**
 * Record an action for rate limiting
 */
export async function recordRateLimitAction(
  actionType: 'template_submission' | 'message_send' | 'api_call'
): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour window

  await supabase.from("meta_rate_limits").insert({
    action_type: actionType,
    window_start: now.toISOString(),
    window_end: windowEnd.toISOString(),
  });
}

/**
 * Check messaging consent for a phone number
 */
export async function checkMessagingConsent(
  phoneE164: string
): Promise<{ hasConsent: boolean; consentType?: string; optedOutAt?: string }> {
  const { data } = await supabase
    .from("meta_messaging_consent")
    .select("*")
    .eq("phone_e164", phoneE164)
    .eq("is_active", true)
    .single();

  if (!data) {
    return { hasConsent: false };
  }

  if (data.opted_out_at) {
    return { hasConsent: false, optedOutAt: data.opted_out_at };
  }

  return { hasConsent: true, consentType: data.consent_type };
}

/**
 * Record messaging consent
 */
export async function recordMessagingConsent(
  phoneE164: string,
  consentType: 'explicit' | 'implicit' | 'transactional',
  source: string,
  entityId?: string,
  orgId?: string
): Promise<boolean> {
  const { error } = await supabase
    .from("meta_messaging_consent")
    .upsert({
      phone_e164: phoneE164,
      consent_type: consentType,
      consent_source: source,
      consented_at: new Date().toISOString(),
      is_active: true,
      opted_out_at: null,
      entity_id: entityId,
      org_id: orgId,
    }, { onConflict: 'phone_e164' });

  return !error;
}

/**
 * Record opt-out
 */
export async function recordOptOut(phoneE164: string): Promise<boolean> {
  const { error } = await supabase
    .from("meta_messaging_consent")
    .update({
      opted_out_at: new Date().toISOString(),
      is_active: false,
    })
    .eq("phone_e164", phoneE164);

  return !error;
}

/**
 * Log template action to audit trail
 */
export async function logTemplateAudit(
  templateName: string,
  action: 'submitted' | 'approved' | 'rejected' | 'deleted',
  validationResult?: ValidationResult,
  metaResponse?: any,
  submittedBy?: string
): Promise<void> {
  await supabase.from("meta_template_audit").insert({
    template_name: templateName,
    action,
    validation_result: validationResult as any,
    meta_response: metaResponse,
    submitted_by: submittedBy,
  });
}

/**
 * Get account health status
 */
export async function getAccountHealth(): Promise<{
  qualityRating: string;
  messagingLimit: string;
  qualityScore: number;
  accountStatus: string;
  templatesSubmittedToday: number;
  messagesSentToday: number;
  rejectionRate30d: number;
}> {
  const { data } = await supabase
    .from("meta_account_health")
    .select("*")
    .limit(1)
    .single();

  const total30d = (data?.templates_approved_30d || 0) + (data?.templates_rejected_30d || 0);
  const rejectionRate = total30d > 0 
    ? (data?.templates_rejected_30d || 0) / total30d 
    : 0;

  return {
    qualityRating: data?.quality_rating || 'GREEN',
    messagingLimit: data?.messaging_limit || 'TIER_1K',
    qualityScore: data?.current_quality_score || 1.0,
    accountStatus: data?.account_status || 'ACTIVE',
    templatesSubmittedToday: data?.templates_submitted_today || 0,
    messagesSentToday: data?.messages_sent_today || 0,
    rejectionRate30d: rejectionRate,
  };
}

/**
 * Update account health metrics
 */
export async function updateAccountHealth(
  updates: Partial<{
    quality_rating: string;
    templates_submitted_today: number;
    templates_rejected_30d: number;
    templates_approved_30d: number;
    messages_sent_today: number;
    account_status: string;
  }>
): Promise<void> {
  await supabase
    .from("meta_account_health")
    .update(updates)
    .neq("id", ""); // Update all rows
}
