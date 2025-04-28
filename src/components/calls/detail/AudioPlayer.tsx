
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileAudio, DownloadCloud } from "lucide-react";
import { downloadAudio } from "./audio/audioUtils";
import { useAudioPlayer } from "./audio/useAudioPlayer";
import AudioControls from "./audio/AudioControls";
import VolumeControl from "./audio/VolumeControl";
import AudioTimeline from "./audio/AudioTimeline";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface AudioPlayerProps {
  audioUrl: string;
  filename: string;
}

export default function AudioPlayer({ audioUrl, filename }: AudioPlayerProps) {
  const {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    controls
  } = useAudioPlayer(audioUrl);

  const handleDownload = (format: 'mp3' | 'txt' = 'mp3') => {
    downloadAudio(audioUrl, filename, format);
  };

  return (
    <Card className="glass-card dark:glass-card-dark p-6">
      <div className="flex items-center justify-between">
        <div className="w-14 h-14 flex items-center justify-center rounded-full bg-primary text-primary-foreground">
          <FileAudio className="h-6 w-6" />
        </div>
        <AudioTimeline 
          currentTime={currentTime} 
          duration={duration} 
          onSeek={controls.handleSeek} 
        />
      </div>

      <div className="flex items-center justify-between mt-6">
        <VolumeControl 
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={controls.handleVolumeChange}
          onMute={controls.handleMute}
        />

        <AudioControls 
          isPlaying={isPlaying}
          onPlayPause={controls.handlePlayPause}
          onSkipBackward={controls.handleSkipBackward}
          onSkipForward={controls.handleSkipForward}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <DownloadCloud className="mr-2 h-4 w-4" />
              Descargar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleDownload('mp3')}>
              Formato MP3
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('txt')}>
              Formato TXT
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={controls.handleTimeUpdate}
        onLoadedMetadata={controls.handleLoadedMetadata}
        onEnded={() => isPlaying && controls.handlePlayPause()}
        className="hidden"
        preload="metadata"
      />
    </Card>
  );
}
