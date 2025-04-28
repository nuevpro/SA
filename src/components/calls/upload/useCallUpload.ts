
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileWithProgress } from "./FileItem";
import { validateCallStatus } from "../detail/CallUtils";

export default function useCallUpload() {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [uploadQueue, setUploadQueue] = useState<FileWithProgress[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const navigate = useNavigate();

  // Verificar sesión al cargar el componente
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log("Verificando sesión en CallUpload...");
        const { data } = await supabase.auth.getSession();
        console.log("Estado de sesión en CallUpload:", data.session ? "Activa" : "No hay sesión");
        
        if (data.session && data.session.user) {
          console.log("Usuario en sesión:", data.session.user.id);
          setCurrentUser(data.session.user);
        } else {
          // Si no hay sesión activa, redirigir al login
          toast.error("No hay sesión activa", {
            description: "Por favor inicie sesión para subir archivos"
          });
          navigate("/login");
          return;
        }
        
        setSessionChecked(true);
      } catch (error) {
        console.error("Error al verificar sesión:", error);
        toast.error("Error al verificar sesión");
        setSessionChecked(true);
      }
    };

    checkSession();
  }, [navigate]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Create file objects with progress
    const newFiles = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      progress: 0,
      status: "idle" as const,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const simulateProgress = (fileId: string, startProgress: number, endProgress: number, duration: number = 10000) => {
    const intervalTime = 500; // Actualizar cada 500ms
    const steps = duration / intervalTime;
    const increment = (endProgress - startProgress) / steps;
    let currentProgress = startProgress;
    
    const interval = setInterval(() => {
      currentProgress += increment;
      if (currentProgress >= endProgress) {
        currentProgress = endProgress;
        clearInterval(interval);
      }
      
      setFiles((prev) => 
        prev.map((f) => 
          f.id === fileId ? { ...f, progress: Math.round(currentProgress) } : f
        )
      );
    }, intervalTime);
    
    return interval;
  };

  // Procesar archivos en bloques de tamaño específico
  const processFileBatch = async (filesToProcess: FileWithProgress[]) => {
    setIsProcessing(true);
    const results = [];
    const total = filesToProcess.length;
    const batchSize = 100; // Procesar 100 archivos a la vez como máximo
    
    // Reiniciar contador de procesados
    setProcessedCount(0);
    
    // Procesar en lotes de batchSize
    for (let i = 0; i < total; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);
      
      // Procesar todo el lote en paralelo
      const batchPromises = batch.map(fileData => processCall(fileData));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Actualizar contador y resultados
      setProcessedCount(prev => prev + batch.length);
      
      // Mapear resultados
      const processedResults = batchResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return { id: batch[index].id, success: true, callId: result.value };
        } else {
          return { 
            id: batch[index].id, 
            success: false, 
            error: result.reason,
            dupeTitleError: result.reason?.dupeTitleError || false
          };
        }
      });
      
      results.push(...processedResults);
    }
    
    setIsProcessing(false);
    return results;
  };

  const processCall = async (fileData: FileWithProgress) => {
    let callId = null;
    let progressInterval: any = null;
    
    try {
      // Update progress to show we're starting
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileData.id ? { ...f, progress: 10, status: "uploading" } : f
        )
      );
      
      // Create a unique filename with timestamp to avoid collisions
      // Use a safe filename - replace special characters
      const originalFileName = fileData.file.name;
      const safeFileName = originalFileName
        .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
        .replace(/_{2,}/g, '_');         // Replace multiple underscores with single
      
      const fileName = `${Date.now()}-${safeFileName}`;
      const filePath = `audio/${fileName}`;
      
      // Extract call title from original filename - remove extension
      const callTitle = originalFileName.replace(/\.[^/.]+$/, "");
      
      // Check if a call with this title already exists
      const { data: existingCalls, error: checkError } = await supabase
        .from('calls')
        .select('id')
        .eq('title', callTitle);
        
      if (checkError) {
        console.error("Error al verificar llamadas existentes:", checkError);
      }
      
      // If call with this title already exists, mark as duplicate and skip
      if (existingCalls && existingCalls.length > 0) {
        console.log(`Llamada con título "${callTitle}" ya existe`);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileData.id ? { 
              ...f, 
              progress: 100, 
              status: "error",
              error: "Grabación ya cargada" 
            } : f
          )
        );
        const error: any = new Error("Título de llamada duplicado");
        error.dupeTitleError = true;
        throw error;
      }
      
      console.log("Subiendo archivo a bucket 'calls':", filePath);
      
      // Upload to Supabase Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('calls')
        .upload(filePath, fileData.file);
        
      if (storageError) {
        console.error("Error en la carga:", storageError);
        throw storageError;
      }
      
      console.log("Carga exitosa:", storageData);
      
      // Get the public URL
      const { data: publicUrlData } = supabase.storage
        .from('calls')
        .getPublicUrl(filePath);
        
      console.log("URL pública:", publicUrlData);
      
      // Update progress to 50%
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileData.id ? { ...f, progress: 50 } : f
        )
      );
      
      // Create a record in the calls table with current date
      const currentDate = new Date().toISOString();
      
      console.log("Insertando registro en la tabla calls...");
      const { data: callData, error: callError } = await supabase
        .from('calls')
        .insert([
          {
            title: callTitle,
            filename: fileName,
            agent_name: "Sin asignar",
            duration: 0,
            date: currentDate,
            audio_url: publicUrlData.publicUrl,
            status: 'transcribing',
            progress: 20
          }
        ])
        .select();
        
      if (callError) {
        console.error("Error al crear registro de llamada:", callError);
        throw callError;
      }
      
      console.log("Registro de llamada creado exitosamente:", callData);
      callId = callData[0].id;
      
      // Iniciar el procesamiento de la llamada
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileData.id ? { ...f, progress: 60, status: "processing" } : f
        )
      );
      
      // Simular progreso mientras se procesa la llamada
      progressInterval = simulateProgress(fileData.id, 60, 95);
      
      // Actualizar progreso en la base de datos
      await updateCallProgress(callId, 50, 'transcribing');
      
      // Enviar a procesar pero no esperar respuesta para permitir procesamiento asíncrono
      if (callData && callData.length > 0) {
        try {
          // Mostrar progreso de transcripción
          await updateCallProgress(callId, 70, 'analyzing');
          
          // Procesar llamada sin esperar el resultado completo
          supabase.functions.invoke('process-call', {
            body: { callId, audioUrl: publicUrlData.publicUrl }
          }).catch(e => console.error("Error en procesamiento background:", e));
          
          // Limpiar intervalo de simulación
          if (progressInterval) clearInterval(progressInterval);
          
          // Mark as completed
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileData.id ? { ...f, progress: 100, status: "success" } : f
            )
          );
          
          // Actualizar estado en la base de datos (asumimos que fue exitoso)
          await updateCallProgress(callId, 90, 'processing');
        } catch (processError) {
          console.error("Error al procesar la llamada:", processError);
          
          // Limpiar intervalo de simulación
          if (progressInterval) clearInterval(progressInterval);
          
          // La carga se realizó correctamente, pero el procesamiento falló
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileData.id ? { 
                ...f, 
                progress: 100, 
                status: "success",
                error: "La carga se completó, pero el procesamiento automático falló. Se procesará manualmente." 
              } : f
            )
          );
          
          // Actualizar estado en la base de datos
          await updateCallProgress(callId, 90, 'error');
        }
      } else {
        // Limpiar intervalo de simulación
        if (progressInterval) clearInterval(progressInterval);
        
        // Mark as completed
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileData.id ? { ...f, progress: 100, status: "success" } : f
          )
        );
      }
      
      return callId;
    } catch (error) {
      console.error("Error en la carga:", error);
      
      // Limpiar intervalo de simulación
      if (progressInterval) clearInterval(progressInterval);
      
      // Mark as failed unless it's a duplicate title error (which is already handled)
      if (!error.dupeTitleError) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileData.id ? { ...f, status: "error", error: error.message } : f
          )
        );
      }
      
      throw error;
    }
  };

  const updateCallProgress = async (callId: string, progress: number, status: string) => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({ progress, status })
        .eq('id', callId);
        
      if (error) {
        console.error("Error al actualizar progreso:", error);
      }
    } catch (e) {
      console.error("Error al actualizar progreso:", e);
    }
  };

  const uploadFiles = async () => {
    if (!currentUser) {
      console.error("No hay usuario autenticado");
      toast.error("No hay usuario autenticado", {
        description: "Por favor inicie sesión para subir archivos"
      });
      navigate("/login");
      return;
    }
    
    console.log("Iniciando proceso de carga con usuario:", currentUser.id);
    
    if (files.length === 0) {
      toast.error("No hay archivos seleccionados", {
        description: "Por favor seleccione archivos para subir"
      });
      return;
    }

    setIsUploading(true);

    try {
      setProcessedCount(0);
      
      toast.info(`Procesando ${files.length} archivos`, {
        description: files.length > 100 
          ? "Se procesarán en lotes de 100 archivos" 
          : "Esto puede tomar algunos minutos"
      });
      
      // Procesar todos los archivos sin límite fijo
      const results = await processFileBatch(files);
      
      // Contar éxitos, errores y duplicados
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success && !r.dupeTitleError).length;
      const dupeCount = results.filter(r => r.dupeTitleError).length;
      
      // Mostrar mensaje según resultados
      if (successCount > 0) {
        toast.success(`Carga completa`, {
          description: `Se subieron ${successCount} archivos${errorCount > 0 ? `, ${errorCount} con errores` : ''}${dupeCount > 0 ? `, ${dupeCount} ya existentes` : ''}`
        });
      } else if (dupeCount === files.length) {
        toast.warning("Todas las grabaciones ya existen", {
          description: "No se ha cargado ningún archivo nuevo"
        });
      } else {
        toast.error("Error al subir archivos", {
          description: "Ningún archivo fue subido correctamente"
        });
      }
    } catch (error) {
      console.error("Error en el proceso de carga:", error);
      toast.error("Error en el proceso de carga", {
        description: error.message || "Hubo un problema durante la carga"
      });
    } finally {
      setIsUploading(false);
      
      // Solo redirigir si hubo algún archivo cargado con éxito
      if (files.some(f => f.status === "success")) {
        setTimeout(() => {
          navigate("/calls");
        }, 2000);
      }
    }
  };

  return {
    files,
    isUploading,
    sessionChecked,
    currentUser,
    isProcessing,
    processedCount,
    totalCount: files.length,
    onDrop,
    removeFile,
    uploadFiles
  };
}
