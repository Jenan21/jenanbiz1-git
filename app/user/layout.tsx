import { UserCenterRouteContract } from "@/components/account/user-center-route-contract";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <UserCenterRouteContract>{children}</UserCenterRouteContract>;
}