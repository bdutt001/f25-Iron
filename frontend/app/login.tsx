import { router } from "expo-router";
import { useEffect } from "react";
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";


export default function LoginScreen() {

  // Inteface and test function for backend connectivity locally.
  // interface Health {
  //   status: string;
  // }
  // const test = async () =>{
  //   try {
  //   const api = process.env.EXPO_PUBLIC_API_URL;
  //   const res = await fetch(`${api}/api`);
  //   const data = (await res.json()) as Health;
  //   console.log("Backend status:", data.status);
  // } catch (err) {
  //   console.error("Error fetching API:", err);
  // }
  // }
  return (
    <View style={styles.container}>
      {/* Logo */}
      <Image 
        source={require("../assets/images/MingleMap-title.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Input fields */}
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#888" />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry placeholderTextColor="#888" />

      {/* Primary button (Login) */}
      <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace("/profile")}>
        <Text style={styles.primaryText}>Login</Text>
      </TouchableOpacity>

      {/* Secondary button (Go to Signup) */}
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push("/signup")}>
        <Text style={styles.secondaryText}>Go to Signup</Text>
      </TouchableOpacity>

      {/* Test for backend conenction remove from code whenever */}
      {/* <TouchableOpacity style={styles.secondaryBtn} onPress={test}>
        <Text style={styles.secondaryText}>test backend</Text>
      </TouchableOpacity> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center", 
    padding: 20, 
    backgroundColor: "#121212" 
  },
  logo: {
    width: 280,
    height: 100,
    marginBottom: 30,
  },
  input: { 
    borderWidth: 1, 
    borderColor: "#ccc", 
    marginBottom: 12, 
    padding: 10, 
    borderRadius: 6, 
    backgroundColor: "#fff", 
    width: "100%", 
    color: "#000"
  },
  primaryBtn: {
    backgroundColor: "#007BFF", // blue
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryBtn: {
    borderColor: "#ccc",
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  secondaryText: {
    color: "#333",
    fontSize: 16,
  },
});
