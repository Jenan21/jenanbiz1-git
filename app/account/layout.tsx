import { UserCenterRouteContract } from "@/components/account/user-center-route-contract";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <UserCenterRouteContract>{children}</UserCenterRouteContract>;
}