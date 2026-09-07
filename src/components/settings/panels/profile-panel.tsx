"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUser, useUpdateProfile, useWorkspaces } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/components/settings/settings-ui";
import { Skeleton } from "@/components/ui/skeleton";

export function ProfilePanel() {
  const { data: me, isLoading } = useCurrentUser();
  const { data: workspaces } = useWorkspaces();
  const updateProfile = useUpdateProfile();
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!me) return null;

  if (!loaded) {
    setFullName(me.fullName || "");
    setAvatarUrl(me.avatarUrl || "");
    setLoaded(true);
  }

  const handleSave = () => {
    if (!fullName.trim()) {
      toast.error("Name is required");
      return;
    }
    updateProfile.mutate(
      { fullName: fullName.trim(), avatarUrl: avatarUrl.trim() || null },
      { onSuccess: () => toast.success("Profile updated"), onError: () => toast.error("Failed to update profile") }
    );
  };

  const wsEntries = Object.entries(me.roles);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avatar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarImage src={me.avatarUrl || undefined} />
              <AvatarFallback>{initials(me.fullName || me.email)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Label htmlFor="avatarUrl">Avatar URL</Label>
              <Input
                id="avatarUrl"
                placeholder="https://example.com/avatar.jpg"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={me.email} disabled />
          </div>
          <Button onClick={handleSave} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
        </CardHeader>
        <CardContent>
          {me.isGlobalOwner && (
            <div className="mb-3">
              <Badge variant="destructive">Global Owner</Badge>
            </div>
          )}
          {wsEntries.length > 0 ? (
            <div className="space-y-2">
              {wsEntries.map(([wsId, role]) => {
                const ws = workspaces?.find((w) => w.id === wsId);
                return (
                  <div key={wsId} className="flex items-center gap-2">
                    <span className="text-sm">{ws?.name || wsId}</span>
                    <Badge variant={role === "owner" ? "destructive" : "secondary"}>
                      {role}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No workspace memberships</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
