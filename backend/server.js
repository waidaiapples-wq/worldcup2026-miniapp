import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "World Cup backend is running"
  });
});

const PORT = process.env.PORT || 3000;
app.get("/health-db", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .limit(1);

  if (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }

  res.json({
    status: "ok",
    supabase: "connected",
    usersFound: data.length
  });
});
app.get("/leaderboard", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, first_name, photo_url, total_points")
    .order("total_points", { ascending: false })
    .limit(100);

  if (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }

  res.json({
    status: "ok",
    leaderboard: data
  });
});
app.listen(PORT, () => {
  console.log(`Backend started on port ${PORT}`);
});