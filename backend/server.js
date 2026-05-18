import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
const MATCH_TIMES = {
  "Group A__Canada__Mexico": "2026-06-11T19:00:00Z",
  "Group A__USA__Japan": "2026-06-11T22:00:00Z"
};

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
  points: 0,
  locked:
    MATCH_TIMES[p.match_key]
      ? new Date() >= new Date(MATCH_TIMES[p.match_key])
      : false
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
app.get("/live-matches", async (req, res) => {

  try {

    const response = await fetch(
      "https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2025-2026"
    );

    const data = await response.json();

    res.json({
      status: "ok",
      events: data.events || []
    });

  } catch (e) {

    res.status(500).json({
      status: "error",
      message: e.message
    });

  }

});
function calcScorePoints(pred1, pred2, real1, real2) {
  if (pred1 === null || pred2 === null) return 0;

  let points = 0;

  if (pred1 === real1 && pred2 === real2) {
    points += 30;
  }

  const predDiff = pred1 - pred2;
  const realDiff = real1 - real2;

  if (predDiff === realDiff && predDiff !== 0) {
    points += 10;
  }

  const predResult = predDiff > 0 ? "home" : predDiff < 0 ? "away" : "draw";
  const realResult = realDiff > 0 ? "home" : realDiff < 0 ? "away" : "draw";

  if (predResult === realResult) {
    points += 10;
  }

  return points;
}
app.post("/calculate-points", async (req, res) => {

  const {
  match_key,
  real1,
  real2
} = req.body;

try {

  await supabase
    .from("match_results")
    .upsert({
      match_key,
      team1: match_key.split("__")[1],
      team2: match_key.split("__")[2],
      score1: real1,
      score2: real2,
      status: "finished"
    });

    const { data: predictions, error } = await supabase
      .from("predictions")
      .select("*")
      .eq("match_key", match_key);

    if (error) {
      throw error;
    }

    for (const p of predictions) {

      const pts = calcScorePoints(
        p.score1,
        p.score2,
        real1,
        real2
      );

      await supabase
        .from("predictions")
        .update({
          points: pts
        })
        .eq("id", p.id);

      const { data: user } = await supabase
        .from("users")
        .select("total_points")
        .eq("id", p.user_id)
        .single();

      const total = (user?.total_points || 0) + pts;

      await supabase
        .from("users")
        .update({
          total_points: total
        })
        .eq("id", p.user_id);
    }

    await supabase
  .from("predictions")
  .update({
    locked: true
  })
  .eq("match_key", match_key);
  
  res.json({
      status: "ok",
      updated: predictions.length
    });

  } catch (e) {

    res.status(500).json({
      status: "error",
      message: e.message
    });

  }

});
app.get("/match-results", async (req, res) => {
  const { data, error } = await supabase
    .from("match_results")
    .select("*");

  if (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }

  res.json({
    status: "ok",
    results: data
  });
});
app.get("/match-results", async (req, res) => {
  const { data, error } = await supabase
    .from("match_results")
    .select("*");

  if (error) {
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }

  res.json({
    status: "ok",
    results: data
  });
});
app.listen(PORT, () => {
  console.log(`Backend started on port ${PORT}`);
});