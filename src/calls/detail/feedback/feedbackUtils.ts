
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BehaviorAnalysis } from "@/lib/types";

// Función para disparar el análisis de comportamientos - solo se llama manualmente
export async function triggerBehaviorAnalysis(callId: string): Promise<BehaviorAnalysis[]> {
  if (!callId) {
    throw new Error("Call ID is required");
  }
  
  try {
    console.log("Triggering behavior analysis for call:", callId);
    
    // First check if there's already feedback with behaviors analysis
    const { data: existingFeedback, error: feedbackError } = await supabase
      .from('feedback')
      .select('behaviors_analysis')
      .eq('call_id', callId)
      .maybeSingle();
      
    if (feedbackError && feedbackError.code !== 'PGRST116') {
      console.error("Error checking existing feedback:", feedbackError);
    }
    
    // If feedback with behaviors_analysis already exists, return it (prevent regeneration)
    if (existingFeedback && existingFeedback.behaviors_analysis && 
        Array.isArray(existingFeedback.behaviors_analysis) && 
        existingFeedback.behaviors_analysis.length > 0) {
      console.log("Using existing behaviors_analysis from database:", existingFeedback.behaviors_analysis);
      toast.info("El feedback de esta llamada ya existe y es permanente");
      return validateBehaviorsAnalysis(existingFeedback.behaviors_analysis);
    }
    
    // Check if there are active behaviors
    const { data: activeBehaviors, error: behaviorsError } = await supabase
      .from('behaviors')
      .select('id')
      .eq('is_active', true);
      
    if (behaviorsError) {
      console.error("Error checking active behaviors:", behaviorsError);
      throw behaviorsError;
    }
    
    if (!activeBehaviors || activeBehaviors.length === 0) {
      console.warn("No active behaviors found");
      toast.error("No hay comportamientos activos para analizar");
      return [];
    }
    
    console.log(`Found ${activeBehaviors.length} active behaviors, calling analyze-call function`);
    
    // Call the analyze-call Supabase edge function
    toast.loading("Analizando llamada...", { id: "analyze-call" });
    
    try {
      const { data: functionData, error: functionError } = await supabase.functions.invoke("analyze-call", {
        body: { callId: callId }
      });
      
      if (functionError) {
        console.error("Error invoking analyze-call function:", functionError);
        toast.error("Error al analizar la llamada", { 
          id: "analyze-call",
          description: functionError.message || "Verifica la configuración de la API de OpenAI"
        });
        throw new Error(functionError.message || "Error al analizar la llamada");
      }
      
      console.log("Analysis result:", functionData);
      
      // Check if we got behaviors_analysis in the response
      if (functionData?.behaviors_analysis && Array.isArray(functionData.behaviors_analysis) && functionData.behaviors_analysis.length > 0) {
        console.log("Received behaviors_analysis:", functionData.behaviors_analysis);
        toast.success("Análisis generado", { id: "analyze-call" });
        
        return validateBehaviorsAnalysis(functionData.behaviors_analysis);
      } else {
        console.warn("No behaviors_analysis in response:", functionData);
        toast.error("No se encontraron análisis de comportamientos", { id: "analyze-call" });
        
        if (functionData?.error) {
          throw new Error(functionData.error);
        }
        
        return [];
      }
    } catch (error) {
      toast.error("Error al analizar la llamada", { 
        id: "analyze-call",
        description: error instanceof Error ? error.message : "Error desconocido"
      });
      throw error;
    }
  } catch (error) {
    console.error("Error in triggerBehaviorAnalysis:", error);
    throw error;
  }
}

// This function only checks for existing feedback, doesn't auto-generate
export async function loadActiveBehaviorsAnalysis(
  callId: string, 
  existingBehaviorsAnalysis?: BehaviorAnalysis[]
): Promise<BehaviorAnalysis[]> {
  if (!callId) return [];
  
  // If there's existing feedback with behaviors_analysis, use that
  if (existingBehaviorsAnalysis && existingBehaviorsAnalysis.length > 0) {
    console.log("Using provided existing behaviors_analysis:", existingBehaviorsAnalysis);
    return existingBehaviorsAnalysis;
  }
  
  try {
    // Check if there's already feedback with behaviors analysis in the database
    const { data: feedbackRecord, error: feedbackError } = await supabase
      .from('feedback')
      .select('behaviors_analysis')
      .eq('call_id', callId)
      .maybeSingle();
      
    if (feedbackError && feedbackError.code !== 'PGRST116') {
      console.error("Error checking feedback record:", feedbackError);
    }
    
    // If there's existing feedback with behaviors_analysis, use that
    if (feedbackRecord && feedbackRecord.behaviors_analysis && 
        Array.isArray(feedbackRecord.behaviors_analysis) && 
        feedbackRecord.behaviors_analysis.length > 0) {
      console.log("Found behaviors_analysis in database feedback record:", feedbackRecord.behaviors_analysis);
      return validateBehaviorsAnalysis(feedbackRecord.behaviors_analysis);
    }
    
    // If no feedback exists, just return empty array (don't generate)
    console.log("No existing feedback found, returning empty array (manual generation required)");
    return [];
    
  } catch (error) {
    console.error("Error in loadActiveBehaviorsAnalysis:", error);
    return [];
  }
}

// Helper function to validate behaviors analysis - Enhanced to better handle JSON
export function validateBehaviorsAnalysis(data: any): BehaviorAnalysis[] {
  // If it's not an array, try to parse it if it's a string, or convert to an empty array
  if (!Array.isArray(data)) {
    console.error("Expected an array for behaviors_analysis, got:", typeof data);
    try {
      // Try to parse if it's a JSON string
      if (typeof data === 'string') {
        data = JSON.parse(data);
      } else {
        return [];
      }
    } catch (e) {
      console.error("Error parsing behaviors_analysis:", e);
      return [];
    }
  }
  
  // Now filter and map the array to ensure each item conforms to BehaviorAnalysis type
  return data.filter(item => {
    const isValid = item && 
      typeof item === 'object' && 
      typeof item.name === 'string' && 
      (item.evaluation === 'cumple' || item.evaluation === 'no cumple') &&
      typeof item.comments === 'string';
      
    if (!isValid) {
      console.error("Invalid behavior item:", item);
    }
    return isValid;
  }).map(item => ({
    name: item.name,
    evaluation: item.evaluation as "cumple" | "no cumple",
    comments: item.comments
  }));
}
