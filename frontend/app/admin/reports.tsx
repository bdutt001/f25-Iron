// app/admin/reports.tsx (Expo Router style)
import { Redirect } from "expo-router";
import AdminReportsScreen from "@/app/(tabs)/AdminReportsScreen";
import { useUser } from "@/context/UserContext";

export default function AdminReportsRoute() {
  const { currentUser } = useUser();

  if (!currentUser?.isAdmin) {
    return <Redirect href="/" />; // back to home
  }

  return <AdminReportsScreen />;
}
