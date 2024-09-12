const express = require("express");
const axios = require("axios");
const nunjucks = require("nunjucks");
const ColorThief = require("colorthief");
const fs = require("fs");
const tmp = require("tmp");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = 8000;

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

nunjucks.configure("views", {
  autoescape: true,
  express: app,
});

async function getAccessToken() {
  const tokenUrl = "https://accounts.spotify.com/api/token";
  const response = await axios.post(tokenUrl, null, {
    params: {
      grant_type: "refresh_token",
      refresh_token: refresh_token,
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${client_id}:${client_secret}`
      ).toString("base64")}`,
    },
  });

  return response.data.access_token;
}

async function getCurrentlyPlayingSong(accessToken) {
  try {
    const response = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.data && response.data.item) {
      const currentlyPlaying = response.data.item;
      return {
        song_name: currentlyPlaying.name,
        artist_name: currentlyPlaying.artists
          .map((artist) => artist.name)
          .join(", "),
        cover_image: (
          await axios.get(currentlyPlaying.album.images[0].url, {
            responseType: "arraybuffer",
          })
        ).data.toString("base64"),
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error retrieving currently playing song:", error);
    return null;
  }
}

async function getRecentlyPlayedSongs(accessToken) {
  try {
    const response = await axios.get(
      "https://api.spotify.com/v1/me/player/recently-played",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.data && response.data.items.length > 0) {
      const recentlyPlayed = response.data.items[0].track;
      return {
        song_name: recentlyPlayed.name,
        artist_name: recentlyPlayed.artists
          .map((artist) => artist.name)
          .join(", "),
        cover_image: (
          await axios.get(recentlyPlayed.album.images[0].url, {
            responseType: "arraybuffer",
          })
        ).data.toString("base64"),
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error retrieving recently played songs:", error);
    return null;
  }
}

async function getColorPalette(coverImageBase64) {
  try {
    const imageBuffer = Buffer.from(coverImageBase64, "base64");

    const tmpFile = tmp.fileSync({ postfix: ".jpg" });
    fs.writeFileSync(tmpFile.name, imageBuffer);

    const palette = await ColorThief.getPalette(tmpFile.name, 5);

    tmpFile.removeCallback();

    const rgbToCss = (rgbArray) =>
      `rgb(${rgbArray[0]}, ${rgbArray[1]}, ${rgbArray[2]})`;

    return [rgbToCss(palette[0]), rgbToCss(palette[1]), rgbToCss(palette[2])];
  } catch (error) {
    console.error("Error getting color palette:", error);
    return null;
  }
}

app.get("/", async (req, res) => {
  try {
    const accessToken = await getAccessToken();

    let songData = await getCurrentlyPlayingSong(accessToken);
    let title_text = "Now playing";

    if (!songData) {
      songData = await getRecentlyPlayedSongs(accessToken);
      title_text = "Recently played";
    }

    if (!songData) {
      res.status(404).json({ error: "No song data available." });
      return;
    }

    const song_name = songData ? songData.song_name : null;
    const artist_name = songData ? songData.artist_name : null;
    const cover_image = songData
      ? `data:image/jpeg;base64,${songData.cover_image}`
      : null;

    const viewAnimation = song_name && song_name.length > 24;
    const palette = await getColorPalette(songData.cover_image);

    const svg = nunjucks.render("spotifycard.html.j2", {
      height: 450,
      title_text: title_text,
      song_name: song_name,
      viewAnimation: viewAnimation,
      artist_name: artist_name,
      img: cover_image,
      color1: palette[0],
      color2: palette[1],
      color3: palette[2],
    });

    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);
  } catch (error) {
    console.error("Error generating Spotify card:", error);
    res.status(500).json({ error: "Error generating Spotify card" });
  }
});

app.get('/test', (req, res) => {
  res.send('Hello World');
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

module.exports = app;