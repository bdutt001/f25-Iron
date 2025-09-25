import app from "./app";

const PORT = process.env.PORT || 8000;
const HOST_IP = process.env.HOST_IP;

// backend listening on port 8000
//  will only work for emulators when hosted in docker
app.listen(PORT, () => {
  console.log(`Server running on http://${HOST_IP}:${PORT}`);
});

// Below is for physical phone testing in expo. Will accept connections from anywhere
//  use for dev  remove if deploying
// app.listen(PORT, "0.0.0.0" ,() => {
//   console.log(`Server running on http://${PORT}`);
// });
