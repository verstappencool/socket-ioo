const express = require("express");
const http = require("http");
const path = require("path");
const socketIo = require("socket.io");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Konfigurasi Supabase

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
  },
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello, world!" });
});

// Endpoint API untuk mendapatkan room
app.get("/api/rooms", async (req, res) => {
  try {
    const { data, error } = await supabase.from("rooms").select("*");
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/api/rooms/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("name")
      .eq("id", roomId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Endpoint API untuk mendapatkan pesan dari room tertentu
app.get("/api/messages/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", roomId);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

io.on("connection", (socket) => {
  console.log("A user connected");

  const sendRoomList = async () => {
    try {
      const { data: rooms, error } = await supabase.from("rooms").select("*");
      if (error) throw error;
      socket.emit("room list", rooms);
    } catch (error) {
      console.error("Error fetching rooms:", error.message);
    }
  };

  sendRoomList();

  socket.on("join room", async (roomId) => {
    socket.join(roomId);
    console.log(`User joined room ${roomId}`);

    try {
      const { data: messages, error } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      socket.emit("message history", messages);
    } catch (error) {
      console.error("Error fetching messages:", error.message);
    }
  });

  socket.on("create room", async (roomName) => {
    console.log("Creating room:", roomName);
    try {
      const { data: insert, error: insertErr } = await supabase
        .from("rooms")
        .insert([{ name: roomName }])
        .single();

      if (insertErr) {
        console.error("Error creating room:", insertErr.message);
        return;
      }

      const roomCreated = insert;

      if (!roomCreated || !roomCreated.id || !roomCreated.name) {
        console.error("Invalid room data:", roomCreated);
        return;
      }

      console.log("Room created:", roomCreated);

      // Emit updated list of rooms to all clients
      const { data: updatedRooms, error: roomListError } = await supabase
        .from("rooms")
        .select("*");

      if (roomListError) {
        console.error(
          "Error fetching updated room list:",
          roomListError.message
        );
        return;
      }

      io.emit("room list", updatedRooms);

      // Emit new room to clients
      io.emit("room created", roomCreated);
    } catch (error) {
      console.error("Error creating room:", error.message);
    }
  });

  socket.on("chat message", async (data) => {
    const { name, message, roomId } = data;

    try {
      const { error } = await supabase
        .from("messages")
        .insert([{ name, message, room_id: roomId }]);

      if (error) throw error;

      io.to(roomId).emit("chat message", data);
    } catch (error) {
      console.error("Error sending message:", error.message);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Export the function for Vercel
module.exports = (req, res) => {
  app(req, res);
};
