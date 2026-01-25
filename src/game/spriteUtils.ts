import { Sprite } from "@babylonjs/core";

export const alignSpriteToGround = (sprite: Sprite) => {
  sprite.position.y = sprite.height * 0.5;
};
