# Plex — rules as the web app will implement them

Source: "How to Plex" video (narration in `rules-video-transcript.md`, plus what the footage shows move by move).
Lines marked **(assumed)** are not stated or shown in the video; they are defaults that can be changed.

## Pieces
- Board: none. Stones lie on a triangle grid that grows outward from the centre.
- 1 red centre stone (the Plex-Key). It never moves.
- 12 blue stones, 12 yellow stones. Every stone is the same chevron shape (4 triangles).
- Point stones: triangles (1 point) and diamonds (2 points). Orange = yellow's points, violet = blue's points.

## Turn
- Players alternate. A turn is: take one stone from your row and place it, in any rotation.
- The stone must lie on the grid, overlap nothing, and touch the pieces already on the table with at least two of its corners (confirmed). A shared edge counts, and so do two separate corner contacts, as at 1:20 in the video where the blue stone sits under the red notch. One corner alone is not enough.
- Stones already placed are never moved. The only stones that leave the table are captured ones.
- Yellow places first, like white in chess (confirmed).

## Rule 1 — surround the red stone
- You win at once when the red stone is enclosed by your colour.
- The enclosure may also use common ground (point stones of either colour, and empty spaces left by captured stones).
- Opponent stones may sit inside the enclosure; they do not break it.
- Test used by the app: starting from the red stone and walking across edges through opponent stones and open grid only, you cannot reach the outside. Stones that meet at a corner close the gap between them (the 1:20 example scores two points this way).

## Rule 2 — points
- When a placed stone closes off a hollow space, the player who placed it fills that space with their own point stones: 1 per triangle, 2 per diamond. Bigger hollows give more points.
- Any stones can form the walls of the hollow, including the red stone and the opponent's stones (shown at 1:12–1:20).
- Point stones are common ground: either player can use them to surround the red stone or an opponent's stone.
- If all stones are placed and nobody has surrounded the red stone, the player with more points wins. Equal points is a draw (confirmed). Surrounding the red stone always beats a win on points (confirmed).

## Rule 3 — eating
- If an opponent's stone is completely enclosed by your colour, the red stone and/or common ground, you take it off the table.
- It changes to your colour and joins your row, so you have one more stone to place later.
- The space it leaves stays empty for the rest of the game and is common ground.
- You can lose your own stones this way through your own move (the 2:37 example: yellow scores 4 points and landlocks two of its own stones, which blue then takes).
- Order when one move does several things **(assumed)**: surrounding red is checked first and ends the game; otherwise captures are resolved, then hollows are filled, then red is checked again for both players because the new common ground can complete either ring.
- A hollow of any size is filled completely, one point per triangle **(assumed)**.
