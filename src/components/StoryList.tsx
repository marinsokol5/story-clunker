import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Story {
  id: string;
  title: string;
  genre: string;
  created_at: string;
  updated_at: string;
}

interface StoryListProps {
  onSelectStory: (storyId: string) => void;
  refreshTrigger?: number;
}

const genreColors = {
  scary: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  funny: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  "sci-fi": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  fantasy: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
};

const StoryList = ({ onSelectStory, refreshTrigger }: StoryListProps) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchStories = async () => {
    try {
      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setStories(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load stories",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, [refreshTrigger]);

  const handleDelete = async (storyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { error } = await supabase
        .from("stories")
        .delete()
        .eq("id", storyId);

      if (error) throw error;

      toast({
        title: "Story deleted",
        description: "Your story has been removed",
      });
      
      fetchStories();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete story",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <BookOpen className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No stories yet</h3>
        <p className="text-muted-foreground">
          Start your creative journey by writing your first story!
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {stories.map((story) => (
        <Card
          key={story.id}
          className="cursor-pointer hover:shadow-lg transition-all group"
          onClick={() => onSelectStory(story.id)}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg line-clamp-2 flex-1">
                {story.title}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDelete(story.id, e)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <CardDescription>
              Updated {formatDistanceToNow(new Date(story.updated_at))} ago
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className={genreColors[story.genre as keyof typeof genreColors]}
            >
              {story.genre}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default StoryList;
