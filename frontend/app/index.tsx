import { Redirect } from "expo-router";

export default function Index() {
  // When the app launches, send the user straight to login
  return <Redirect href="/login" />;
}
