"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

// A client page rather than a server redirect: Supabase can land a login on "/"
// carrying a ?code=, which a server-side redirect to /scan would strip. Staying
// on "/" lets AuthProvider exchange the code first, then we move on.
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/scan");
  }, [loading, user, router]);

  return null;
}
