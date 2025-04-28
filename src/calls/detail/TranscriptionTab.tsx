
import React, { useState, useMemo } from "react";
import { Call } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Volume, VolumeX, User, UserRound, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface TranscriptionTabProps {
  call: Call;
  transcriptSegments: any[];
}

export default function TranscriptionTab({ call, transcriptSegments }: TranscriptionTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
  // Calculate speaker statistics if available
  const speakerStats = call.speaker_analysis || null;
  
  if (!call.transcription) {
    return (
      <Card className="glass-card dark:glass-card-dark p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No hay transcripción disponible</h3>
          <p className="text-sm text-muted-foreground mt-1">
            La transcripción para esta llamada aún no está disponible.
          </p>
        </div>
      </Card>
    );
  }

  // Parse transcript segments if needed
  let segments = transcriptSegments;

  if (segments.length === 0 && typeof call.transcription === 'string') {
    try {
      segments = JSON.parse(call.transcription);
    } catch (e) {
      console.error("Error parsing transcript segments:", e);
      segments = [];
    }
  }

  // Enhanced silence detection - more strict detection
  const silences = useMemo(() => {
    // First, identify segments explicitly marked as silence
    const explicitSilences = segments
      .filter(segment => 
        segment.speaker === "silence" || 
        segment.text?.toLowerCase().includes("silencio") ||
        segment.text?.toLowerCase().includes("silence")
      )
      .map(segment => ({
        start: segment.start || 0,
        end: segment.end || 0,
        duration: (segment.end || 0) - (segment.start || 0)
      }));
      
    // Then, find gaps between spoken segments (implicit silences)
    const sortedSegments = [...segments]
      .filter(segment => 
        segment.speaker !== "silence" && 
        !segment.text?.toLowerCase().includes("silencio") &&
        !segment.text?.toLowerCase().includes("silence")
      )
      .sort((a, b) => (a.start || 0) - (b.start || 0));
    
    const implicitSilences = [];
    
    // Look for gaps between segments
    for (let i = 0; i < sortedSegments.length - 1; i++) {
      const currentEnd = sortedSegments[i].end || 0;
      const nextStart = sortedSegments[i + 1].start || 0;
      const gap = nextStart - currentEnd;
      
      if (gap >= 2) { // 2 second threshold
        implicitSilences.push({
          start: currentEnd,
          end: nextStart,
          duration: gap
        });
      }
    }
    
    // Combine all silences and filter by duration
    return [...explicitSilences, ...implicitSilences]
      .filter(silence => silence.duration >= 2)
      .sort((a, b) => a.start - b.start);
  }, [segments]);

  // Improved speaker identification
  const processedSegments = segments.map(segment => {
    // Create a copy of the segment to avoid mutating the original
    const processedSegment = { ...segment };
    
    // Check if it's a silence segment
    if (
      (processedSegment.text && 
       (processedSegment.text.toLowerCase().includes("silencio") || 
        processedSegment.text.toLowerCase().includes("silence"))) ||
      processedSegment.speaker === "silence"
    ) {
      processedSegment.speaker = "silence";
      return processedSegment;
    }
    
    // Identify speakers based on patterns in the text or segment structure
    if (!processedSegment.speaker) {
      // Try to identify based on text patterns
      const text = (processedSegment.text || "").toLowerCase();
      
      // Check for patterns that might indicate agent vs client
      if (text.includes("gracias por llamar") || 
          text.includes("mi nombre es") || 
          text.includes("le atiende") || 
          text.includes("le puedo ayudar") ||
          text.includes("servicio al cliente") || 
          text.includes("bienvenido a")) {
        processedSegment.speaker = "agent";
      } 
      // Try to identify client based on common client phrases
      else if (text.includes("mi problema es") || 
               text.includes("quisiera saber") || 
               text.includes("tengo una duda") || 
               text.includes("necesito ayuda") ||
               text.includes("mi consulta")) {
        processedSegment.speaker = "client";
      }
      // Try speaker ID if available
      else if (segment.speaker_id !== undefined || segment.speakerId !== undefined) {
        const speakerId = segment.speaker_id || segment.speakerId;
        // Convert numerical ID to role (typically 0 = agent, 1 = client)
        processedSegment.speaker = speakerId === 0 || speakerId === "0" ? "agent" : "client";
      }
      // Use alternating pattern as last resort based on segment index
      else if (segments.length > 1) {
        // Assume first speaker is agent, then alternate
        const index = segments.indexOf(segment);
        processedSegment.speaker = index % 2 === 0 ? "agent" : "client";
      }
      else {
        processedSegment.speaker = "unknown";
      }
    }
    // Normalize existing speaker values
    else {
      processedSegment.speaker = normalizeSpekearRole(processedSegment.speaker);
    }
    
    return processedSegment;
  });

  // Calculate total speaking time and percentages
  const speakingTimeStats = useMemo(() => {
    let agentTime = 0;
    let clientTime = 0;
    let silenceTime = 0;
    let totalTime = 0;

    processedSegments.forEach(segment => {
      const duration = (segment.end || 0) - (segment.start || 0);
      totalTime += duration;

      if (segment.speaker === "agent") {
        agentTime += duration;
      } else if (segment.speaker === "client") {
        clientTime += duration;
      } else if (segment.speaker === "silence") {
        silenceTime += duration;
      }
    });
    
    // Add silences total time
    silenceTime = silences.reduce((total, silence) => total + silence.duration, 0);
    
    // Recalculate total time
    totalTime = agentTime + clientTime + silenceTime;

    return {
      agentTime,
      clientTime,
      silenceTime,
      totalTime,
      agentPercentage: totalTime > 0 ? Math.round((agentTime / totalTime) * 100) : 0,
      clientPercentage: totalTime > 0 ? Math.round((clientTime / totalTime) * 100) : 0,
      silencePercentage: totalTime > 0 ? Math.round((silenceTime / totalTime) * 100) : 0
    };
  }, [processedSegments, silences]);

  // Filter segments based on search query
  const filteredSegments = useMemo(() => {
    // First, let's convert silences into displayable segments and merge with regular segments
    const silenceSegments = silences.map(silence => ({
      speaker: "silence",
      text: `Silencio detectado (${Math.round(silence.duration)} segundos)`,
      start: silence.start,
      end: silence.end
    }));
    
    // Create a combined list of all segments
    const allSegments = [...processedSegments, ...silenceSegments]
      .sort((a, b) => (a.start || 0) - (b.start || 0));
    
    // Apply search filtering if needed
    if (!searchQuery) return allSegments;
    
    return allSegments.filter(segment => 
      segment.text?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [processedSegments, silences, searchQuery]);

  // Helper function to normalize speaker roles
  function normalizeSpekearRole(speaker: string): string {
    // Convert various speaker identifications to consistent formats
    const speakerLower = speaker.toLowerCase();
    
    if (speakerLower.includes("agent") || 
        speakerLower.includes("asesor") || 
        speakerLower === "a" || 
        speakerLower === "0" ||
        speakerLower === "speaker_0" ||
        speakerLower === "speaker 0") {
      return "agent";
    } 
    else if (speakerLower.includes("client") || 
             speakerLower.includes("cliente") || 
             speakerLower === "b" || 
             speakerLower === "1" ||
             speakerLower === "speaker_1" ||
             speakerLower === "speaker 1") {
      return "client";
    } 
    else if (speakerLower.includes("silence") || 
             speakerLower.includes("silencio")) {
      return "silence";
    }
    
    return "unknown";
  }

  // Helper function to format time in mm:ss
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Helper function to format time in readable format
  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    
    if (mins > 0) {
      return `${mins} min ${secs} seg`;
    }
    return `${secs} segundos`;
  }

  // Function to highlight search terms in text
  function highlightSearchTerms(text: string) {
    if (!searchQuery || !text) return text;
    
    // Create a regex with the search query and replace matches with highlighted spans
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
  }

  return (
    <Card className="glass-card dark:glass-card-dark p-6">
      <div className="space-y-6">
        {/* Speaker statistics section - Enhanced with detailed time information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col p-4 bg-blue-100 dark:bg-blue-900/30 rounded-md">
            <div className="flex items-center space-x-2 mb-2">
              <UserRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium">Asesor</span>
            </div>
            <div className="text-2xl font-bold mb-1">{speakerStats?.porcentaje_asesor || speakingTimeStats.agentPercentage || 0}%</div>
            <div className="text-sm text-muted-foreground">del tiempo hablado</div>
            <div className="mt-2 text-sm font-medium">
              Tiempo: {formatDuration(speakingTimeStats.agentTime)}
            </div>
          </div>
          
          <div className="flex flex-col p-4 bg-green-100 dark:bg-green-900/30 rounded-md">
            <div className="flex items-center space-x-2 mb-2">
              <User className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span className="font-medium">Cliente</span>
            </div>
            <div className="text-2xl font-bold mb-1">{speakerStats?.porcentaje_cliente || speakingTimeStats.clientPercentage || 0}%</div>
            <div className="text-sm text-muted-foreground">del tiempo hablado</div>
            <div className="mt-2 text-sm font-medium">
              Tiempo: {formatDuration(speakingTimeStats.clientTime)}
            </div>
          </div>
          
          <div className="flex flex-col p-4 bg-gray-100 dark:bg-gray-800/50 rounded-md">
            <div className="flex items-center space-x-2 mb-2">
              <VolumeX className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <span className="font-medium">Silencios</span>
            </div>
            <div className="text-2xl font-bold mb-1">{silences.length || 0}</div>
            <div className="text-sm text-muted-foreground">silencios prolongados</div>
            <div className="mt-2 text-sm font-medium">
              Duración total: {formatDuration(speakingTimeStats.silenceTime)}
            </div>
          </div>
        </div>

        {/* Silence summary section - Enhanced with detailed information */}
        {silences.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
            <h4 className="text-sm font-medium flex items-center mb-2 text-yellow-800 dark:text-yellow-300">
              <Clock className="h-4 w-4 mr-2" />
              Silencios prolongados detectados
            </h4>
            <div className="space-y-2">
              <div className="grid grid-cols-12 text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Inicio</div>
                <div className="col-span-4">Fin</div>
                <div className="col-span-3">Duración</div>
              </div>
              {silences.map((silence, idx) => (
                <div key={idx} className="grid grid-cols-12 text-sm items-center">
                  <div className="col-span-1 text-yellow-700 dark:text-yellow-400">
                    {idx + 1}
                  </div>
                  <div className="col-span-4 font-medium">
                    {formatTime(silence.start)}
                  </div>
                  <div className="col-span-4 font-medium">
                    {formatTime(silence.end)}
                  </div>
                  <div className="col-span-3 text-yellow-600 dark:text-yellow-400">
                    {Math.round(silence.duration)}s
                  </div>
                </div>
              ))}
              <div className="text-xs text-yellow-600 dark:text-yellow-500 mt-2">
                Los silencios prolongados pueden indicar dudas, confusión o búsqueda de información. Se detectan silencios de 2+ segundos.
              </div>
            </div>
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar en la transcripción..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div>
          <h3 className="text-lg font-medium mb-4">Transcripción de la llamada</h3>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4">
              {filteredSegments && filteredSegments.length > 0 ? (
                filteredSegments.map((segment, index) => {
                  // Determine speaker type and style
                  let speakerClass = "";
                  let speakerLabel = "";
                  let speakerIcon = null;
                  
                  if (segment.speaker === "agent") {
                    speakerClass = "bg-blue-100 dark:bg-blue-900/30 border-l-4 border-blue-500";
                    speakerLabel = "Asesor";
                    speakerIcon = <UserRound className="h-4 w-4 text-blue-600 dark:text-blue-400 mr-2" />;
                  } else if (segment.speaker === "client") {
                    speakerClass = "bg-green-100 dark:bg-green-900/30 border-l-4 border-green-500";
                    speakerLabel = "Cliente";
                    speakerIcon = <User className="h-4 w-4 text-green-600 dark:text-green-400 mr-2" />;
                  } else if (segment.speaker === "silence") {
                    speakerClass = "bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-400";
                    speakerLabel = "Silencio";
                    speakerIcon = <VolumeX className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-2" />;
                  } else {
                    // Fallback styling for unknown speaker
                    speakerClass = "bg-gray-100 dark:bg-gray-800/50 border-l-4 border-gray-400";
                    speakerLabel = "Desconocido";
                    speakerIcon = <Volume className="h-4 w-4 text-gray-600 dark:text-gray-400 mr-2" />;
                  }
                  
                  return (
                    <div 
                      key={index} 
                      className={`p-3 rounded-md ${speakerClass}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="font-semibold text-sm flex items-center">
                          {speakerIcon}
                          {speakerLabel}:
                        </div>
                        {searchQuery && segment.text ? (
                          <div 
                            className="flex-1"
                            dangerouslySetInnerHTML={{ __html: highlightSearchTerms(segment.text) }}
                          />
                        ) : (
                          <div className="flex-1">
                            {segment.text}
                          </div>
                        )}
                        {segment.start !== undefined && segment.end !== undefined && (
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(segment.start)} - {formatTime(segment.end)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground">
                  {searchQuery ? "No se encontraron resultados para la búsqueda." : "No se encontraron segmentos en la transcripción."}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Card>
  );
}
