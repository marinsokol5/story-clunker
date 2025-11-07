import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, ArrowLeft, Sparkles, Lightbulb } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StorySegment {
  id: string;
  content: string;
  is_ai_generated: boolean;
  sequence_order: number;
  created_at: string;
}

interface Story {
  id: string;
  title: string;
  genre: string;
}

interface StoryBuilderProps {
  storyId: string;
  onBack: () => void;
}

const StoryBuilder = ({ storyId, onBack }: StoryBuilderProps) => {
  const [story, setStory] = useState<Story | null>(null);
  const [segments, setSegments] = useState<StorySegment[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analyzingSegmentId, setAnalyzingSegmentId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStoryData();
  }, [storyId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  const fetchStoryData = async () => {
    setIsLoading(true);
    try {
      const { data: storyData, error: storyError } = await supabase
        .from("stories")
        .select("*")
        .eq("id", storyId)
        .single();

      if (storyError) throw storyError;
      setStory(storyData);

      const { data: segmentsData, error: segmentsError } = await supabase
        .from("story_segments")
        .select("*")
        .eq("story_id", storyId)
        .order("sequence_order", { ascending: true });

      if (segmentsError) throw segmentsError;
      setSegments(segmentsData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load story",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitSegment = async () => {
    if (!userInput.trim()) return;

    try {
      const nextOrder = segments.length;
      
      const { error } = await supabase.from("story_segments").insert({
        story_id: storyId,
        content: userInput.trim(),
        is_ai_generated: false,
        sequence_order: nextOrder,
      });

      if (error) throw error;

      setUserInput("");
      await fetchStoryData();
      
      // Trigger AI generation
      generateAIContinuation();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to save your segment",
        variant: "destructive",
      });
    }
  };

  const generateAIContinuation = async () => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch('/api/generate-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          previousSegments: segments.map((s) => ({
            content: s.content,
            is_ai_generated: s.is_ai_generated,
          })),
          genre: story?.genre,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      const nextOrder = segments.length + 1;
      
      const { error: insertError } = await supabase.from("story_segments").insert({
        story_id: storyId,
        content: data.continuation,
        is_ai_generated: true,
        sequence_order: nextOrder,
      });

      if (insertError) throw insertError;

      await fetchStoryData();
      
      toast({
        title: "AI continuation added!",
        description: "The story continues...",
      });
    } catch (error: any) {
      const errorMessage = error.message || "Failed to generate AI continuation";
      
      if (errorMessage.includes("Rate limit")) {
        toast({
          title: "Rate Limit",
          description: "Please wait a moment before requesting another continuation.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("credits")) {
        toast({
          title: "Credits Depleted",
          description: "Please add credits to continue using AI features.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGetSuggestions = async (segmentId: string) => {
    setAnalyzingSegmentId(segmentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch('/api/suggest-improvements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ segmentId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      setSuggestions(data.suggestions);
      setShowSuggestions(true);
      
      toast({
        title: "Suggestions ready!",
        description: "Check out the AI's feedback on your writing.",
      });
    } catch (error: any) {
      const errorMessage = error.message || "Failed to get suggestions";
      
      if (errorMessage.includes("Rate limit")) {
        toast({
          title: "Rate Limit",
          description: "Please wait a moment before requesting more suggestions.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("credits")) {
        toast({
          title: "Credits Depleted",
          description: "Please add credits to continue using AI features.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setAnalyzingSegmentId(null);
    }
  };

  if (isLoading || !story) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{story.title}</h2>
          <Badge variant="outline" className="mt-1">
            {story.genre}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
        <div className="space-y-4 pb-4">
          {segments.map((segment) => (
            <Card
              key={segment.id}
              className={`p-4 ${
                segment.is_ai_generated
                  ? "bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20"
                  : "bg-card"
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                {segment.is_ai_generated && (
                  <Sparkles className="h-5 w-5 text-primary shrink-0 mt-1" />
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap flex-1">
                  {segment.content}
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleGetSuggestions(segment.id)}
                  disabled={analyzingSegmentId === segment.id}
                  className="text-xs"
                >
                  {analyzingSegmentId === segment.id ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Lightbulb className="h-3 w-3 mr-1" />
                      Get Feedback
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
          
          {isGenerating && (
            <Card className="p-4 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">
                  AI is writing the next part...
                </p>
              </div>
            </Card>
          )}
        </div>
      </ScrollArea>

      <div className="mt-4 flex gap-2">
        <Textarea
          placeholder="Write the next part of your story..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          className="min-h-[100px] resize-none"
          disabled={isGenerating}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) {
              handleSubmitSegment();
            }
          }}
        />
        <Button
          onClick={handleSubmitSegment}
          disabled={!userInput.trim() || isGenerating}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        Press Ctrl+Enter to send
      </p>

      <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              AI Writing Suggestions
            </DialogTitle>
            <DialogDescription>
              Here are some tips to improve your story segment
            </DialogDescription>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-sm">{suggestions}</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoryBuilder;
