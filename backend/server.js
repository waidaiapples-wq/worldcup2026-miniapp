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
app.post("/save-predictions", async (req, res) => {
  const { userId, predictions } = req.body;

  if (!userId || !Array.isArray(predictions)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid payload"
    });
  }

  const rows = predictions.map(p => ({
    user_id: userId,
    match_key: p.match_key,
    team1: p.team1,
    team2: p.team2,
    score1: p.score1,
    score2: p.score2,
    answers: p.answers || {},
    points: 0
  }));

  const { error } = await supabase
    .from("predictions")
    .upsert(rows, {
      onConflict: "user_id,match_key"
    });

  if (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }

  res.json({
    status: "ok",
    saved: rows.length
  });
});
app.listen(PORT, () => {
  console.log(`Backend started on port ${PORT}`);
});