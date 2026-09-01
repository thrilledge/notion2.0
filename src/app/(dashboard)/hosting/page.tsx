import type { Metadata } from "next";
import { HostingClientList } from "@/components/projects/hosting-client-list";

export const metadata: Metadata = {
  title: "Hosting Clients",
};

export default function HostingPage() {
  return <HostingClientList />;
}
