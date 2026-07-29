import { useState, useMemo } from "react";
import { 
  useListCapabilities, 
  useGetCatalogSummary, 
  useVoteCapability,
  useListCapabilityComments,
  useCreateCapabilityComment,
  CapabilityStatus 
} from "@workspace/api-client-react";
import { useClientId } from "@/hooks/use-client-id";
import { useToast } from "@/hooks/use-toast";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { getListCapabilitiesQueryKey, getGetCatalogSummaryQueryKey } from "@workspace/api-client-react";
import type { Capability } from "@workspace/api-client-react";

export default function Roadmap() {
  const [filterStatus, setFilterStatus] = useState<CapabilityStatus | "all">("all");
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<number | null>(null);

  const { data: capabilities = [], isLoading: isLoadingCaps } = useListCapabilities();
  const { data: summary, isLoading: isLoadingSummary } = useGetCatalogSummary();

  const filteredCapabilities = useMemo(() => {
    if (filterStatus === "all") return capabilities;
    return capabilities.filter(c => c.status === filterStatus);
  }, [capabilities, filterStatus]);

  return (
    <div className="w-full flex flex-col min-h-screen">
      <div className="border-b border-border bg-surface-variant">
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-16">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight uppercase mb-4 text-transparent bg-clip-text bg-gradient-to-r from-foreground to-muted-foreground">
            Service Catalog
          </h1>
          <p className="text-muted-foreground font-mono max-w-2xl">
            Live infrastructure roadmap. Review capabilities, cast your vote, and shape the network. Votes are tracked per client.
          </p>
        </div>
      </div>

      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {isLoadingSummary ? (
            <div className="h-10 flex items-center font-mono text-sm text-muted-foreground animate-pulse">
              LOADING_SUMMARY_DATA...
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 font-mono text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase">Shipped:</span>
                <span className="font-bold text-foreground">{summary?.shippedCount || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase">Beta:</span>
                <span className="font-bold text-secondary">{summary?.betaCount || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase">Proposed:</span>
                <span className="font-bold text-primary">{summary?.proposedCount || 0}</span>
              </div>
              <div className="ml-auto flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground uppercase">Total Votes:</span>
                  <span className="font-bold">{summary?.totalVotes || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground uppercase">Total Comments:</span>
                  <span className="font-bold">{summary?.totalComments || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 w-full flex-1 flex flex-col md:flex-row gap-8">
        <div className="flex-1">
          <div className="mb-6 flex items-center gap-2 border-b border-border pb-4">
            <span className="font-mono text-xs text-muted-foreground uppercase mr-4">Filter by Status:</span>
            {(["all", "shipped", "beta", "proposed"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as any)}
                className={`px-3 py-1 font-mono text-xs uppercase border ${
                  filterStatus === status 
                    ? 'border-foreground bg-foreground text-background' 
                    : 'border-border bg-transparent text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {isLoadingCaps ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="border border-border p-6 bg-card animate-pulse h-32" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCapabilities.length === 0 ? (
                <div className="border border-border border-dashed p-12 text-center text-muted-foreground font-mono uppercase">
                  No capabilities found matching criteria.
                </div>
              ) : (
                filteredCapabilities.map((capability) => (
                  <CapabilityCard 
                    key={capability.id} 
                    capability={capability} 
                    isActive={selectedCapabilityId === capability.id}
                    onSelect={() => setSelectedCapabilityId(capability.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Comment Panel */}
        <div className="w-full md:w-[400px] shrink-0 border border-border bg-card flex flex-col max-h-[800px] sticky top-8">
          {selectedCapabilityId ? (
            <CommentPanel capabilityId={selectedCapabilityId} capabilities={capabilities} />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground font-mono text-sm uppercase">
              Select a capability to view and add comments.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CapabilityCard({ capability, isActive, onSelect }: { capability: Capability, isActive: boolean, onSelect: () => void }) {
  const clientId = useClientId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const voteMutation = useVoteCapability({
    mutation: {
      onSuccess: () => {
        // Invalidate capabilities list and summary to update vote counts
        queryClient.invalidateQueries({ queryKey: getListCapabilitiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCatalogSummaryQueryKey() });
        toast({
          title: "VOTE_REGISTERED",
          description: `Vote counted for ${capability.name}.`,
          duration: 3000,
        });
      },
      onError: (err) => {
        toast({
          title: "VOTE_FAILED",
          description: "Failed to register vote. You might have already voted.",
          variant: "destructive",
        });
      }
    }
  });

  const handleVote = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card selection
    voteMutation.mutate({
      id: capability.id,
      data: { clientId }
    });
  };

  const statusColors = {
    shipped: "border-border text-muted-foreground bg-surface-variant",
    beta: "border-secondary text-secondary bg-secondary/10",
    proposed: "border-primary text-primary bg-primary/10",
  };

  return (
    <div 
      className={`border p-5 cursor-pointer transition-all ${
        isActive 
          ? 'border-foreground bg-surface-variant shadow-[4px_4px_0_hsl(var(--foreground))]' 
          : 'border-border bg-card hover:border-muted-foreground hover:-translate-y-1 hover:shadow-[4px_4px_0_hsl(var(--surface-variant))]'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className={`font-mono text-[10px] px-2 py-0.5 uppercase border ${statusColors[capability.status]}`}>
              {capability.status}
            </span>
            <span className="font-mono text-xs text-muted-foreground bg-background px-2 border border-border">
              {capability.category}
            </span>
          </div>
          <h3 className="text-xl font-bold uppercase tracking-tight mb-2">{capability.name}</h3>
          <p className="text-muted-foreground text-sm">{capability.description}</p>
        </div>
        
        <div className="flex flex-col items-end gap-3 shrink-0">
          <button 
            onClick={handleVote}
            disabled={voteMutation.isPending || capability.status === "shipped"}
            className="flex flex-col items-center justify-center min-w-16 p-2 border border-border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent disabled:cursor-not-allowed group"
          >
            <svg width="20" height="20" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-1 text-muted-foreground group-hover:text-primary group-disabled:text-muted-foreground transition-colors"><path d="M7.14645 2.14645C7.34171 1.95118 7.65829 1.95118 7.85355 2.14645L11.8536 6.14645C12.0488 6.34171 12.0488 6.65829 11.8536 6.85355C11.6583 7.04882 11.3417 7.04882 11.1464 6.85355L8 3.70711V12.5C8 12.7761 7.77614 13 7.5 13C7.22386 13 7 12.7761 7 12.5V3.70711L3.85355 6.85355C3.65829 7.04882 3.34171 7.04882 3.14645 6.85355C2.95118 6.65829 2.95118 6.34171 3.14645 6.14645L7.14645 2.14645Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            <span className="font-mono font-bold text-lg leading-none">{capability.votes}</span>
          </button>
          
          <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-xs">
            <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 2C2.22386 2 2 2.22386 2 2.5V10.5C2 10.7761 2.22386 11 2.5 11H5.50379L7.5 13L9.49621 11H12.5C12.7761 11 13 10.7761 13 10.5V2.5C13 2.22386 12.7761 2 12.5 2H2.5ZM1 2.5C1 1.67157 1.67157 1 2.5 1H12.5C13.3284 1 14 1.67157 14 2.5V10.5C14 11.3284 13.3284 12 12.5 12H9.8844L7.89737 13.987C7.68334 14.2011 7.31666 14.2011 7.10263 13.987L5.1156 12H2.5C1.67157 12 1 11.3284 1 10.5V2.5ZM4.5 4H10.5V5H4.5V4ZM10.5 7H4.5V8H10.5V7Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            <span>{capability.commentCount || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentPanel({ capabilityId, capabilities }: { capabilityId: number, capabilities: Capability[] }) {
  const capability = capabilities.find(c => c.id === capabilityId);
  const { data: comments = [], isLoading } = useListCapabilityComments(capabilityId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");

  const commentMutation = useCreateCapabilityComment({
    mutation: {
      onSuccess: () => {
        setBody("");
        // Invalidate comments and capability list (for comment count)
        queryClient.invalidateQueries({ queryKey: [`/api/capabilities/${capabilityId}/comments`] });
        queryClient.invalidateQueries({ queryKey: getListCapabilitiesQueryKey() });
        toast({
          title: "COMMENT_POSTED",
          description: "Your feedback has been logged.",
        });
      },
      onError: () => {
        toast({
          title: "ERROR",
          description: "Failed to post comment. Check your connection.",
          variant: "destructive",
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    
    commentMutation.mutate({
      id: capabilityId,
      data: {
        body,
        authorName: authorName.trim() || undefined
      }
    });
  };

  if (!capability) return null;

  return (
    <div className="flex flex-col h-full h-[600px] md:h-auto">
      <div className="p-4 border-b border-border bg-surface-variant flex items-center justify-between">
        <h4 className="font-mono font-bold uppercase text-sm truncate pr-4">
          COMMENTS: <span className="text-muted-foreground">{capability.slug}</span>
        </h4>
        <span className="font-mono text-xs border border-border px-1">{comments.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <span className="font-mono text-xs text-muted-foreground animate-pulse">FETCHING_LOGS...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-mono text-xs text-muted-foreground uppercase border border-dashed border-border p-4">No comments yet. Be the first to provide feedback.</p>
          </div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-foreground">
                  {comment.authorName || "ANONYMOUS"}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{comment.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-border bg-card">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="NAME (OPTIONAL)"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="w-full bg-background border border-border px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-secondary transition-colors"
          />
          <textarea
            placeholder="ENTER FEEDBACK..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={3}
            className="w-full bg-background border border-border px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-secondary transition-colors resize-none"
          />
          <button
            type="submit"
            disabled={commentMutation.isPending || !body.trim()}
            className="w-full bg-foreground text-background font-mono text-sm uppercase px-4 py-2 hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent active:scale-[0.98]"
          >
            {commentMutation.isPending ? "TRANSMITTING..." : "POST COMMENT"}
          </button>
        </form>
      </div>
    </div>
  );
}
