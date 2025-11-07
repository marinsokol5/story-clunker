import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { z } from "zod";

interface NewStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStoryCreated: () => void;
}

const genres = [
  { value: "scary", label: "Scary", emoji: "👻" },
  { value: "funny", label: "Funny", emoji: "😄" },
  { value: "sci-fi", label: "Sci-Fi", emoji: "🚀" },
  { value: "fantasy", label: "Fantasy", emoji: "✨" },
];

const storySchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title too long"),
  initialContent: z.string().min(10, "Please write at least 2-3 sentences to start your story").max(1000, "Initial content too long"),
});

const NewStoryDialog = ({ open, onOpenChange, onStoryCreated }: NewStoryDialogProps) => {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("funny");
  const [initialContent, setInitialContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    setIsLoading(true);
    
    try {
      // Validate inputs
      storySchema.parse({ title, initialContent });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create story
      const { data: story, error: storyError } = await supabase
        .from("stories")
        .insert({
          title: title.trim(),
          genre,
          user_id: user.id,
        })
        .select()
        .single();

      if (storyError) throw storyError;

      // Add initial segment
      const { error: segmentError } = await supabase
        .from("story_segments")
        .insert({
          story_id: story.id,
          content: initialContent.trim(),
          is_ai_generated: false,
          sequence_order: 0,
        });

      if (segmentError) throw segmentError;

      toast({
        title: "Story created!",
        description: "Your creative journey begins...",
      });

      // Reset form
      setTitle("");
      setInitialContent("");
      setGenre("funny");
      onOpenChange(false);
      onStoryCreated();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to create story",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Start a New Story</DialogTitle>
          <DialogDescription>
            Choose a genre and write the opening lines. The AI will help continue your story.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Story Title</Label>
            <Input
              id="title"
              placeholder="Enter a captivating title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Genre</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {genres.map((g) => (
                <Button
                  key={g.value}
                  variant={genre === g.value ? "default" : "outline"}
                  onClick={() => setGenre(g.value)}
                  className="h-auto py-3 flex-col gap-1"
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="text-sm">{g.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initial">Opening Lines (2-3 sentences)</Label>
            <Textarea
              id="initial"
              placeholder="Once upon a time..."
              value={initialContent}
              onChange={(e) => setInitialContent(e.target.value)}
              className="min-h-[120px] resize-none"
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground">
              {initialContent.length}/1000 characters
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={isLoading || !title.trim() || !initialContent.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Story"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewStoryDialog;
