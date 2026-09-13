from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIRECTORY = REPOSITORY_ROOT / "docs" / "plans" / "v2" / "B03" / "images" / "design"
FONT_PATH = Path(os.environ["WINDIR"]) / "Fonts" / "meiryo.ttc"

WIDTH = 1600
HEIGHT = 1000

BACKGROUND = "#F4F1E9"
PANEL = "#FFFDF8"
INK = "#263238"
MUTED = "#657478"
WALL = "#37474F"
COLLIDER = "#9A6A3A"
PASSABLE = "#4B83A6"
ROUTE = "#4C9A68"
ROUTE_LIGHT = "#DDECDD"
RESERVE = "#E3A24C"
RESERVE_LIGHT = "#F6E3C3"
SCATTER = "#D96C6C"
FIXTURE = "#7A8B8E"
CLOSED_WINDOW = "#A7B0B2"
LINK = "#8A5AA5"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = Path(os.environ["WINDIR"]) / "Fonts" / ("meiryob.ttc" if bold else "meiryo.ttc")
    return ImageFont.truetype(str(path), size)


TITLE_FONT = font(38, True)
SUBTITLE_FONT = font(21)
PANEL_TITLE_FONT = font(24, True)
BODY_FONT = font(17)
SMALL_FONT = font(14)
TINY_FONT = font(12)


def canvas(title: str, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.text((52, 32), title, font=TITLE_FONT, fill=INK)
    draw.text((54, 87), subtitle, font=SUBTITLE_FONT, fill=MUTED)
    return image, draw


def draw_panel(
    draw: ImageDraw.ImageDraw,
    bounds: tuple[int, int, int, int],
    title: str,
    size_label: str,
    reserve_side: str = "top",
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = bounds
    draw.rounded_rectangle(bounds, radius=12, fill=PANEL, outline=WALL, width=5)
    draw.text((x1 + 18, y1 + 14), title, font=PANEL_TITLE_FONT, fill=INK)
    draw.text((x2 - 18, y1 + 19), size_label, font=SMALL_FONT, fill=MUTED, anchor="ra")
    room = (x1 + 35, y1 + 60, x2 - 35, y2 - 30)
    draw.rectangle(room, outline=WALL, width=7)
    rx1, ry1, rx2, ry2 = room
    if reserve_side == "top":
        reserve = (rx1 + 7, ry1 + 7, rx2 - 7, ry1 + 39)
        reserve_label = "窓位置承認待ち保留帯"
    else:
        reserve = (rx1 + 7, ry1 + 7, rx1 + 39, ry2 - 7)
        reserve_label = "窓\n保\n留"
    draw.rectangle(reserve, fill=RESERVE_LIGHT, outline=RESERVE, width=2)
    label_x = (reserve[0] + reserve[2]) // 2
    label_y = (reserve[1] + reserve[3]) // 2
    draw.multiline_text(
        (label_x, label_y),
        reserve_label,
        font=TINY_FONT,
        fill="#825A20",
        anchor="mm",
        align="center",
        spacing=0,
    )
    return room


def furniture(
    draw: ImageDraw.ImageDraw,
    bounds: tuple[int, int, int, int],
    label: str = "",
    kind: str = "collider",
    label_size: str = "small",
) -> None:
    fill = COLLIDER if kind == "collider" else PASSABLE if kind == "passable" else FIXTURE
    draw.rounded_rectangle(bounds, radius=4, fill=fill, outline=INK, width=1)
    if label:
        selected_font = TINY_FONT if label_size == "tiny" else SMALL_FONT
        x1, y1, x2, y2 = bounds
        draw.text(((x1 + x2) // 2, (y1 + y2) // 2), label, font=selected_font, fill="white", anchor="mm")


def route(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    width: int = 22,
) -> None:
    draw.line(points, fill=ROUTE_LIGHT, width=width + 10, joint="curve")
    draw.line(points, fill=ROUTE, width=4, joint="curve")


def door(draw: ImageDraw.ImageDraw, position: tuple[int, int], side: str = "right") -> None:
    x, y = position
    if side == "right":
        draw.rectangle((x - 7, y - 38, x + 8, y + 38), fill=PANEL)
        draw.line((x, y - 38, x - 55, y - 38), fill=FIXTURE, width=5)
        draw.arc((x - 110, y - 38, x, y + 72), 270, 360, fill=FIXTURE, width=2)
    elif side == "bottom":
        draw.rectangle((x - 38, y - 7, x + 38, y + 8), fill=PANEL)
        draw.line((x - 38, y, x - 38, y - 55), fill=FIXTURE, width=5)
        draw.arc((x - 38, y - 110, x + 72, y), 90, 180, fill=FIXTURE, width=2)


def scatter_zone(draw: ImageDraw.ImageDraw, bounds: tuple[int, int, int, int], label: str = "散乱候補") -> None:
    x1, y1, x2, y2 = bounds
    draw.rectangle(bounds, outline=SCATTER, width=3)
    for offset in range(-80, x2 - x1 + 80, 18):
        sx = max(x1, x1 + offset)
        sy = max(y1, y2 - offset)
        ex = min(x2, x1 + offset + (y2 - y1))
        ey = min(y2, y2 - offset + (x2 - x1))
        if sx <= ex and sy <= ey:
            draw.line((sx, sy, ex, ey), fill="#E7AAAA", width=1)
    draw.text((x1 + 6, y2 - 5), label, font=TINY_FONT, fill="#943F3F", anchor="ls")


def legend(draw: ImageDraw.ImageDraw) -> None:
    y = 932
    entries = [
        (COLLIDER, "通行不可家具"),
        (PASSABLE, "通り抜け可能小物"),
        (ROUTE, "主要通路"),
        (RESERVE, "窓位置承認待ち"),
        (SCATTER, "散乱候補区域"),
    ]
    x = 52
    for color, text_value in entries:
        draw.rectangle((x, y, x + 26, y + 20), fill=color, outline=INK, width=1)
        draw.text((x + 36, y + 10), text_value, font=SMALL_FONT, fill=INK, anchor="lm")
        x += 290


def save(image: Image.Image, filename: str) -> None:
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT_DIRECTORY / filename, format="PNG", optimize=True)


def draw_classroom() -> None:
    image, draw = canvas(
        "01 普通教室 配置比較",
        "約9.1m×10.0m／推奨案D06-2: 30組、D07-2: 15～25%をTransformで散乱",
    )
    room = draw_panel(draw, (150, 140, 1450, 880), "普通教室", "9.1m × 10.0m", reserve_side="left")
    x1, y1, x2, y2 = room
    furniture(draw, (x1 + 130, y1 + 20, x2 - 210, y1 + 60), "黒板", "passable")
    furniture(draw, (x1 + 510, y1 + 85, x1 + 660, y1 + 135), "教員机")
    furniture(draw, (x1 + 52, y2 - 95, x1 + 250, y2 - 38), "荷物ロッカー")
    furniture(draw, (x1 + 270, y2 - 95, x1 + 385, y2 - 38), "掃除ロッカー")
    start_x = x1 + 155
    start_y = y1 + 155
    for row in range(6):
        for column in range(5):
            desk_x = start_x + column * 175
            desk_y = start_y + row * 65
            furniture(draw, (desk_x, desk_y, desk_x + 82, desk_y + 36), "", "collider")
            furniture(draw, (desk_x + 27, desk_y + 43, desk_x + 56, desk_y + 66), "", "passable")
    route(draw, [(x2 - 105, y2 - 70), (x2 - 105, y1 + 150), (x1 + 595, y1 + 150)])
    scatter_zone(draw, (x1 + 80, y1 + 510, x1 + 420, y2 - 115))
    door(draw, (x2, y1 + 170))
    door(draw, (x2, y2 - 120))
    legend(draw)
    save(image, "01_classroom.png")


def draw_infirmary_library() -> None:
    image, draw = canvas(
        "02 保健室・図書室 配置比較",
        "保健室は旧普通教室、図書室は1階西側統合特別教室の前後扉を維持",
    )
    infirmary = draw_panel(draw, (55, 140, 755, 880), "保健室", "9.1m × 10.0m", reserve_side="left")
    x1, y1, x2, y2 = infirmary
    furniture(draw, (x1 + 90, y1 + 90, x1 + 420, y1 + 175), "ベッド1")
    furniture(draw, (x1 + 90, y1 + 225, x1 + 420, y1 + 310), "ベッド2")
    furniture(draw, (x1 + 460, y1 + 100, x1 + 600, y1 + 165), "教員机")
    furniture(draw, (x1 + 470, y1 + 195, x1 + 590, y1 + 300), "医療棚")
    furniture(draw, (x1 + 80, y2 - 110, x1 + 250, y2 - 50), "収納")
    route(draw, [(x2 - 70, y2 - 90), (x2 - 70, y1 + 360), (x1 + 450, y1 + 360)])
    scatter_zone(draw, (x1 + 320, y2 - 150, x1 + 520, y2 - 55), "紙類候補")
    door(draw, (x2, y2 - 110))

    library = draw_panel(draw, (805, 140, 1545, 880), "図書室", "9.1m × 20.0m", reserve_side="left")
    x1, y1, x2, y2 = library
    for index in range(6):
        shelf_y = y1 + 70 + index * 83
        furniture(draw, (x1 + 62, shelf_y, x1 + 150, shelf_y + 62), "棚", "collider", "tiny")
        furniture(draw, (x2 - 155, shelf_y, x2 - 67, shelf_y + 62), "棚", "collider", "tiny")
    for row in range(2):
        for column in range(2):
            table_x = x1 + 235 + column * 190
            table_y = y1 + 175 + row * 205
            furniture(draw, (table_x, table_y, table_x + 135, table_y + 82), "閲覧机")
    furniture(draw, (x1 + 230, y2 - 105, x1 + 445, y2 - 50), "受付")
    route(draw, [(x2 - 55, y2 - 80), (x1 + 365, y2 - 80), (x1 + 365, y1 + 105), (x2 - 55, y1 + 105)])
    scatter_zone(draw, (x1 + 205, y1 + 515, x1 + 485, y1 + 585), "本・紙候補")
    door(draw, (x2, y1 + 105))
    door(draw, (x2, y2 - 80))
    legend(draw)
    save(image, "02_infirmary_library.png")


def draw_staffroom() -> None:
    image, draw = canvas(
        "03 職員室 配置比較",
        "約18.0m×9.0m／12席を3島に分け、南側2扉と机島間の主通路を維持",
    )
    room = draw_panel(draw, (100, 140, 1500, 880), "職員室", "18.0m × 9.0m")
    x1, y1, x2, y2 = room
    for island in range(3):
        base_x = x1 + 170 + island * 370
        for row in range(2):
            for column in range(2):
                desk_x = base_x + column * 145
                desk_y = y1 + 210 + row * 105
                furniture(draw, (desk_x, desk_y, desk_x + 125, desk_y + 62), "机")
                furniture(draw, (desk_x + 48, desk_y + (68 if row == 0 else -34), desk_x + 80, desk_y + (98 if row == 0 else -4)), "", "passable")
    furniture(draw, (x1 + 70, y1 + 70, x1 + 330, y1 + 125), "書棚・掲示")
    furniture(draw, (x2 - 330, y1 + 70, x2 - 70, y1 + 125), "書棚・掲示")
    furniture(draw, (x1 + 505, y2 - 115, x1 + 805, y2 - 55), "共有机")
    route(draw, [(x1 + 190, y2), (x1 + 190, y1 + 165), (x2 - 190, y1 + 165), (x2 - 190, y2)])
    route(draw, [(x1 + 540, y2 - 40), (x1 + 540, y1 + 170)])
    route(draw, [(x1 + 910, y2 - 40), (x1 + 910, y1 + 170)])
    scatter_zone(draw, (x1 + 985, y2 - 140, x2 - 80, y2 - 55), "書類候補")
    door(draw, (x1 + 190, y2), "bottom")
    door(draw, (x2 - 190, y2), "bottom")
    legend(draw)
    save(image, "03_staffroom.png")


def draw_pc_ll() -> None:
    image, draw = canvas(
        "04 PC室・LL教室 配置比較",
        "北側特別教室約18.0m×9.0m／PC室24席、LL教室24席＋ペア学習",
    )
    for offset, title, ll_mode in [(55, "PC室", False), (805, "LL教室", True)]:
        room = draw_panel(draw, (offset, 140, offset + 690, 880), title, "18.0m × 9.0m")
        x1, y1, x2, y2 = room
        furniture(draw, (x1 + 170, y1 + 58, x2 - 170, y1 + 98), "黒板・表示", "passable")
        column_offsets = (60, 140, 220, 355, 435, 515)
        for row in range(4):
            for column_offset in column_offsets:
                desk_x = x1 + column_offset
                desk_y = y1 + 155 + row * 103
                furniture(draw, (desk_x, desk_y, desk_x + 70, desk_y + 42), "PC" if not ll_mode else "LL", "collider", "tiny")
                furniture(draw, (desk_x + 23, desk_y + 49, desk_x + 48, desk_y + 70), "", "passable")
        route(draw, [(x1 + 40, y2 - 85), (x1 + 40, y1 + 130), (x2 - 40, y1 + 130), (x2 - 40, y2 - 85)])
        route(draw, [((x1 + x2) // 2, y2 - 50), ((x1 + x2) // 2, y1 + 130)], 18)
        scatter_zone(draw, (x1 + 85, y2 - 115, x1 + 280, y2 - 50), "紙・筆箱")
        door(draw, (x1 + 70, y2), "bottom")
        door(draw, (x2 - 70, y2), "bottom")
    legend(draw)
    save(image, "04_pc_ll.png")


def draw_council_broadcast() -> None:
    image, draw = canvas(
        "05 生徒会室・放送室 配置比較",
        "2階西側特別区画を約9.0m×9.0mの2室へ分割し、各室1扉を維持",
    )
    council = draw_panel(draw, (90, 140, 780, 880), "生徒会室", "約9.0m × 9.0m", reserve_side="left")
    x1, y1, x2, y2 = council
    furniture(draw, (x1 + 170, y1 + 210, x2 - 170, y1 + 340), "会議机")
    for index in range(4):
        chair_x = x1 + 190 + index * 80
        furniture(draw, (chair_x, y1 + 170, chair_x + 40, y1 + 198), "", "passable")
        furniture(draw, (chair_x, y1 + 350, chair_x + 40, y1 + 378), "", "passable")
    furniture(draw, (x1 + 80, y1 + 75, x1 + 250, y1 + 125), "書類棚")
    furniture(draw, (x2 - 240, y2 - 115, x2 - 70, y2 - 60), "職員机")
    route(draw, [(x2 - 70, y2), (x2 - 70, y1 + 420), (x1 + 125, y1 + 420)])
    scatter_zone(draw, (x1 + 110, y2 - 130, x1 + 310, y2 - 55), "書類候補")
    door(draw, (x2 - 70, y2), "bottom")

    broadcast = draw_panel(draw, (820, 140, 1510, 880), "放送室", "約9.0m × 9.0m", reserve_side="left")
    x1, y1, x2, y2 = broadcast
    furniture(draw, (x1 + 140, y1 + 170, x2 - 130, y1 + 285), "放送卓")
    furniture(draw, (x1 + 155, y1 + 305, x1 + 300, y1 + 370), "PC机")
    furniture(draw, (x2 - 285, y1 + 305, x2 - 140, y1 + 370), "PC机")
    furniture(draw, (x1 + 85, y1 + 75, x1 + 210, y1 + 125), "AV棚")
    furniture(draw, (x2 - 210, y1 + 75, x2 - 85, y1 + 125), "収納")
    route(draw, [(x2 - 70, y2), (x2 - 70, y1 + 430), (x1 + 110, y1 + 430)])
    scatter_zone(draw, (x1 + 95, y2 - 120, x1 + 290, y2 - 55), "紙類候補")
    door(draw, (x2 - 70, y2), "bottom")
    legend(draw)
    save(image, "05_council_broadcast.png")


def draw_science() -> None:
    image, draw = canvas(
        "06 理科室 配置比較",
        "約18.0m×9.0m／実験台6台、スツール24脚、教師実験域と2本の縦主通路",
    )
    room = draw_panel(draw, (100, 140, 1500, 880), "理科室", "18.0m × 9.0m")
    x1, y1, x2, y2 = room
    furniture(draw, (x1 + 270, y1 + 55, x2 - 270, y1 + 100), "黒板", "passable")
    furniture(draw, (x1 + 360, y1 + 125, x2 - 360, y1 + 195), "教師実験台")
    for row in range(2):
        for column in range(3):
            table_x = x1 + 150 + column * 370
            table_y = y1 + 255 + row * 190
            furniture(draw, (table_x, table_y, table_x + 235, table_y + 92), "実験台")
            for chair_offset in (10, 65, 125, 180):
                furniture(draw, (table_x + chair_offset, table_y + 105, table_x + chair_offset + 32, table_y + 132), "", "passable")
    furniture(draw, (x1 + 50, y1 + 90, x1 + 105, y2 - 100), "薬品棚", "collider", "tiny")
    furniture(draw, (x2 - 105, y1 + 90, x2 - 50, y2 - 100), "流し", "collider", "tiny")
    route(draw, [(x1 + 445, y2 - 50), (x1 + 445, y1 + 215)])
    route(draw, [(x1 + 815, y2 - 50), (x1 + 815, y1 + 215)])
    route(draw, [(x1 + 110, y2 - 45), (x2 - 110, y2 - 45)])
    scatter_zone(draw, (x1 + 120, y2 - 135, x1 + 350, y2 - 55), "紙類候補")
    door(draw, (x1 + 170, y2), "bottom")
    door(draw, (x2 - 170, y2), "bottom")
    legend(draw)
    save(image, "06_science.png")


def draw_art_homeec() -> None:
    image, draw = canvas(
        "07 美術室・家庭科室 配置比較",
        "各約18.0m×9.0m／用途を示す大型設備を絞り、中央経路を維持",
    )
    art = draw_panel(draw, (55, 140, 775, 880), "美術室", "18.0m × 9.0m")
    x1, y1, x2, y2 = art
    furniture(draw, (x1 + 180, y1 + 55, x2 - 180, y1 + 95), "黒板", "passable")
    for row in range(2):
        for column in range(3):
            tx = x1 + 95 + column * 190
            ty = y1 + 180 + row * 190
            furniture(draw, (tx, ty, tx + 145, ty + 75), "制作机")
    for index in range(5):
        ex = x1 + 95 + index * 105
        furniture(draw, (ex, y2 - 145, ex + 48, y2 - 65), "画架", "passable", "tiny")
    furniture(draw, (x1 + 45, y1 + 120, x1 + 85, y2 - 170), "作品棚", "collider", "tiny")
    route(draw, [(x2 - 55, y2 - 75), (x2 - 55, y1 + 135), (x1 + 110, y1 + 135)])
    scatter_zone(draw, (x1 + 330, y2 - 165, x2 - 90, y2 - 55), "紙・作品候補")
    door(draw, (x2 - 70, y2), "bottom")

    homeec = draw_panel(draw, (825, 140, 1545, 880), "家庭科室", "18.0m × 9.0m")
    x1, y1, x2, y2 = homeec
    furniture(draw, (x1 + 180, y1 + 55, x2 - 180, y1 + 95), "黒板", "passable")
    for row in range(2):
        for column in range(2):
            tx = x1 + 130 + column * 290
            ty = y1 + 190 + row * 200
            furniture(draw, (tx, ty, tx + 220, ty + 100), "調理台")
    furniture(draw, (x1 + 55, y1 + 135, x1 + 100, y2 - 135), "食器棚", "collider", "tiny")
    furniture(draw, (x2 - 100, y1 + 135, x2 - 55, y2 - 135), "流し", "collider", "tiny")
    route(draw, [((x1 + x2) // 2, y2 - 45), ((x1 + x2) // 2, y1 + 140)])
    route(draw, [(x1 + 115, y2 - 55), (x2 - 115, y2 - 55)])
    door(draw, (x1 + 145, y2), "bottom")
    door(draw, (x2 - 145, y2), "bottom")
    legend(draw)
    save(image, "07_art_homeec.png")


def draw_music_gym_changing() -> None:
    image, draw = canvas(
        "08 音楽室・体育館・更衣室 配置比較",
        "D10案1: 体育館と屋上は競技・安全設備に限定し、中央とプール動線を散乱禁止",
    )
    gym = draw_panel(draw, (45, 140, 945, 880), "体育館・舞台", "24m × 36m", reserve_side="left")
    x1, y1, x2, y2 = gym
    furniture(draw, (x1 + 180, y1 + 45, x2 - 180, y1 + 140), "舞台 12m×5m", "fixture")
    furniture(draw, (x1 + 40, y1 + 250, x1 + 90, y1 + 365), "ゴール", "passable", "tiny")
    furniture(draw, (x2 - 90, y1 + 250, x2 - 40, y1 + 365), "ゴール", "passable", "tiny")
    furniture(draw, (x1 + 110, y2 - 135, x1 + 250, y2 - 70), "跳び箱")
    route(draw, [((x1 + x2) // 2, y2 - 35), ((x1 + x2) // 2, y1 + 150)], 34)
    route(draw, [(x1 + 100, (y1 + y2) // 2), (x2 - 100, (y1 + y2) // 2)], 34)
    draw.text(((x1 + x2) // 2, (y1 + y2) // 2 + 30), "中央競技域・散乱禁止", font=BODY_FONT, fill=ROUTE, anchor="mm")
    door(draw, ((x1 + x2) // 2, y2), "bottom")

    music = draw_panel(draw, (985, 140, 1555, 470), "音楽室", "18.0m × 9.0m")
    x1, y1, x2, y2 = music
    furniture(draw, (x1 + 45, y1 + 75, x1 + 175, y1 + 155), "ピアノ")
    for row in range(3):
        for column in range(6):
            cx = x1 + 210 + column * 48
            cy = y1 + 95 + row * 55
            furniture(draw, (cx, cy, cx + 25, cy + 22), "", "passable")
    furniture(draw, (x2 - 70, y1 + 70, x2 - 35, y2 - 55), "棚", "collider", "tiny")
    route(draw, [(x1 + 190, y2 - 30), (x1 + 190, y1 + 75)])
    door(draw, (x1 + 120, y2), "bottom")

    changing = draw_panel(draw, (985, 510, 1555, 880), "男女更衣室 共通", "各4.5m × 7.0m", reserve_side="left")
    x1, y1, x2, y2 = changing
    furniture(draw, (x1 + 45, y1 + 70, x1 + 145, y2 - 60), "ロッカー", "collider", "tiny")
    furniture(draw, (x2 - 145, y1 + 70, x2 - 45, y2 - 60), "ロッカー", "collider", "tiny")
    furniture(draw, (x1 + 205, y1 + 110, x2 - 205, y1 + 160), "ベンチ")
    furniture(draw, (x1 + 205, y1 + 205, x2 - 205, y1 + 255), "ベンチ")
    route(draw, [((x1 + x2) // 2, y2), ((x1 + x2) // 2, y1 + 70)])
    door(draw, ((x1 + x2) // 2, y2), "bottom")
    legend(draw)
    save(image, "08_music_gym_changing.png")


def option_panel(
    draw: ImageDraw.ImageDraw,
    bounds: tuple[int, int, int, int],
    title: str,
    summary: str,
    recommended: bool = False,
    badge_label: str = "推奨",
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = bounds
    outline = ROUTE if recommended else WALL
    draw.rounded_rectangle(bounds, radius=12, fill=PANEL, outline=outline, width=6 if recommended else 4)
    draw.text((x1 + 18, y1 + 16), title, font=PANEL_TITLE_FONT, fill=INK)
    if recommended:
        draw.rounded_rectangle((x2 - 112, y1 + 13, x2 - 18, y1 + 43), radius=12, fill=ROUTE)
        draw.text((x2 - 65, y1 + 28), badge_label, font=SMALL_FONT, fill="white", anchor="mm")
    draw.multiline_text((x1 + 18, y1 + 56), summary, font=SMALL_FONT, fill=MUTED, spacing=5)
    return bounds


def window_marker(draw: ImageDraw.ImageDraw, center: tuple[int, int], kind: str) -> None:
    x, y = center
    color = PASSABLE if kind == "open" else SCATTER if kind == "broken" else CLOSED_WINDOW
    draw.rounded_rectangle((x - 18, y - 11, x + 18, y + 11), radius=3, fill=color, outline=INK, width=1)
    if kind == "broken":
        draw.line((x - 12, y - 7, x + 10, y + 7), fill="white", width=2)
        draw.line((x + 8, y - 8, x - 4, y + 8), fill="white", width=2)


def draw_window_link_options() -> None:
    image, draw = canvas(
        "09 W02 全窓配置・開放率 再設計",
        "全室・廊下と体育館北・東・西面へ窓を配置。体育館南面（舞台側）は完全窓なし",
    )
    school = option_panel(
        draw,
        (45, 140, 1040, 880),
        "W02-R1 標準窓帯案・代表階平面",
        "外周の各室と中庭側廊下へ18窓／階。青7～8、灰10～11で約40%を開放",
        True,
        "採用",
    )
    x1, y1, x2, y2 = school
    north = (x1 + 120, y1 + 175, x2 - 90, y1 + 405)
    west = (x1 + 120, y1 + 405, x1 + 360, y2 - 75)
    draw.rectangle(north, fill="#E7E4DB", outline=WALL, width=6)
    draw.rectangle(west, fill="#E7E4DB", outline=WALL, width=6)
    draw.text(((north[0] + north[2]) // 2, north[1] + 80), "北翼の特別教室・共用室", font=BODY_FONT, fill=INK, anchor="mm")
    draw.text((west[0] + 72, (west[1] + west[3]) // 2), "西翼\n普通教室等", font=BODY_FONT, fill=INK, anchor="mm", align="center")
    draw.text((north[0] + 385, north[3] - 42), "北翼廊下・中庭側", font=SMALL_FONT, fill=MUTED, anchor="mm")
    draw.text((west[2] - 45, west[1] + 190), "西翼廊下\n中庭側", font=SMALL_FONT, fill=MUTED, anchor="mm", align="center")

    north_outer_states = ("closed", "open", "closed", "open", "closed")
    north_inner_states = ("open", "closed", "closed")
    west_outer_states = ("open", "closed", "closed", "open", "closed")
    west_inner_states = ("closed", "open", "closed")
    for index, state in enumerate(north_outer_states):
        window_marker(draw, (north[0] + 150 + index * 115, north[1] - 2), state)
    for index, state in enumerate(north_inner_states):
        window_marker(draw, (north[0] + 300 + index * 155, north[3] + 2), state)
    for index, state in enumerate(west_outer_states):
        window_marker(draw, (west[0] - 2, west[1] + 45 + index * 52), state)
    for index, state in enumerate(west_inner_states):
        window_marker(draw, (west[2] + 2, west[1] + 55 + index * 80), state)
    window_marker(draw, (north[2] + 2, north[1] + 115), "open")
    window_marker(draw, (west[0] + 120, west[3] + 2), "closed")
    draw.text((x1 + 45, y2 - 43), "代表階: 外周室12窓＋中庭側廊下6窓＝18窓。部屋境界・扉・階段では窓帯を分割", font=SMALL_FONT, fill=INK)

    counts = option_panel(draw, (1080, 140, 1555, 500), "校舎4階 合計", "各階の開放位置は固定パターンを回転", False)
    cx1, cy1, cx2, cy2 = counts
    floor_rows = (("4F", 18, 8, 10), ("3F", 18, 7, 11), ("2F", 18, 7, 11), ("1F", 18, 7, 11))
    for index, (floor, total, opened, closed) in enumerate(floor_rows):
        row_y = cy1 + 125 + index * 48
        draw.text((cx1 + 30, row_y), floor, font=BODY_FONT, fill=INK, anchor="lm")
        draw.text((cx1 + 105, row_y), f"{total}窓", font=SMALL_FONT, fill=MUTED, anchor="lm")
        draw.text((cx1 + 205, row_y), f"開 {opened}", font=SMALL_FONT, fill=PASSABLE, anchor="lm")
        draw.text((cx1 + 300, row_y), f"閉 {closed}", font=SMALL_FONT, fill=INK, anchor="lm")
    draw.line((cx1 + 25, cy2 - 55, cx2 - 25, cy2 - 55), fill=WALL, width=2)
    draw.text((cx1 + 30, cy2 - 30), "校舎72窓／開29・閉43", font=BODY_FONT, fill=INK, anchor="lm")

    gym = option_panel(draw, (1080, 530, 1555, 880), "体育館 北・東・西 上部窓", "北・東・西に各3窓。南面（舞台側）は完全窓なし", False)
    gx1, gy1, gx2, gy2 = gym
    court = (gx1 + 105, gy1 + 115, gx2 - 105, gy2 - 75)
    draw.rectangle(court, fill="#E7E4DB", outline=WALL, width=5)
    gym_states = ("closed", "open", "closed", "open", "closed", "open", "closed", "open", "closed")
    positions = [
        (court[0] + 55 + i * 70, court[1]) for i in range(3)
    ] + [
        (court[2], court[1] + 45 + i * 55) for i in range(3)
    ] + [
        (court[0], court[3] - 45 - i * 55) for i in range(3)
    ]
    for position, state in zip(positions, gym_states, strict=True):
        window_marker(draw, position, state)
    draw.text(((court[0] + court[2]) // 2, (court[1] + court[3]) // 2 - 12), "体育館\n上部窓", font=BODY_FONT, fill=INK, anchor="mm", align="center")
    draw.rectangle((court[0] + 22, court[3] - 30, court[2] - 22, court[3] - 5), fill="#7B8878", outline=WALL, width=2)
    draw.text(((court[0] + court[2]) // 2, court[3] - 18), "南面・舞台側／窓なし", font=SMALL_FONT, fill="white", anchor="mm")
    draw.text((gx1 + 30, gy2 - 35), "9窓／開4・閉5", font=BODY_FONT, fill=INK)

    legend_y = 930
    draw.rounded_rectangle((455, legend_y, 489, legend_y + 22), radius=3, fill=PASSABLE, outline=INK)
    draw.text((501, legend_y + 11), "開放・bit_window", font=SMALL_FONT, fill=INK, anchor="lm")
    draw.rounded_rectangle((795, legend_y, 829, legend_y + 22), radius=3, fill=CLOSED_WINDOW, outline=INK)
    draw.text((841, legend_y + 11), "閉鎖窓", font=SMALL_FONT, fill=INK, anchor="lm")
    draw.text((1120, legend_y + 11), "全81窓／開33・閉48＝40.7%", font=SMALL_FONT, fill=INK, anchor="lm")
    save(image, "09_window_link_options.png")


def roof_plan(
    draw: ImageDraw.ImageDraw,
    bounds: tuple[int, int, int, int],
    routes: tuple[str, ...],
) -> None:
    x1, y1, x2, y2 = bounds
    north = (x1 + 45, y1 + 125, x2 - 45, y1 + 290)
    west = (x1 + 45, y1 + 290, x1 + 145, y2 - 55)
    draw.rectangle(north, fill="#E7E4DB", outline=WALL, width=5)
    draw.rectangle(west, fill="#E7E4DB", outline=WALL, width=5)
    draw.rectangle((x1 + 55, y1 + 140, x1 + 145, y1 + 230), fill=FIXTURE, outline=INK, width=2)
    draw.text((x1 + 100, y1 + 185), "階段室\n更衣室", font=TINY_FONT, fill="white", anchor="mm", align="center")
    draw.rectangle((x1 + 205, y1 + 150, x2 - 105, y1 + 245), fill=PASSABLE, outline=INK, width=2)
    draw.text(((x1 + x2) // 2 + 35, y1 + 197), "プール", font=SMALL_FONT, fill="white", anchor="mm")
    draw.text((x1 + 205, y1 + 270), "中庭側の空き帯", font=TINY_FONT, fill=MUTED, anchor="mm")
    draw.text((x2 - 70, y1 + 270), "東端空き帯", font=TINY_FONT, fill=MUTED, anchor="mm")
    route_points = {
        "east": ((x2 + 8, y1 + 265), (x2 - 72, y1 + 265)),
        "courtyard": ((x1 + 190, y1 + 345), (x1 + 190, y1 + 270)),
        "southwest": ((x1 + 95, y2 + 5), (x1 + 95, y2 - 85)),
    }
    for route_name in routes:
        start, end = route_points[route_name]
        draw.line((start, end), fill=LINK, width=8)
        ex, ey = end
        if route_name == "east":
            head = [(ex, ey), (ex + 18, ey - 12), (ex + 18, ey + 12)]
        else:
            head = [(ex, ey), (ex - 12, ey + 18), (ex + 12, ey + 18)]
        draw.polygon(head, fill=LINK)
        sx, sy = start
        draw.ellipse((sx - 10, sy - 10, sx + 10, sy + 10), fill=PANEL, outline=LINK, width=4)
        draw.ellipse((ex - 10, ey - 10, ex + 10, ey + 10), fill=LINK, outline=INK, width=1)


def draw_roof_link_options() -> None:
    image, draw = canvas(
        "10 W07 屋上 bit_roof 接近案",
        "B02屋上実形状を基準に比較。正確なA/B座標と半径0.54m包絡はB03-1の完成形状で固定",
    )
    configurations = [
        ((45, 140, 520, 880), "案1 東端1経路", "プール・階段室から最も遠い\n制作と検証が最小", ("east",), False),
        ((560, 140, 1035, 880), "案2 中庭側1経路", "校庭から見えやすく接近が短い\n窓経路との間隔調整が必要", ("courtyard",), False),
        ((1075, 140, 1555, 880), "案3 2経路", "東端＋南西端で追跡を分散\nObject・検証・実飛行が2倍", ("east", "southwest"), True),
    ]
    for bounds, title, summary, routes, recommended in configurations:
        x1, y1, x2, y2 = option_panel(draw, bounds, title, summary, recommended, "採用")
        roof_plan(draw, (x1 + 10, y1 + 95, x2 - 10, y2 - 60), routes)
        draw.text((x1 + 28, y2 - 38), "○ 屋外A　● 屋上B　紫線 固定経路候補帯", font=TINY_FONT, fill=INK)
    save(image, "10_roof_link_options.png")


def main() -> None:
    draw_classroom()
    draw_infirmary_library()
    draw_staffroom()
    draw_pc_ll()
    draw_council_broadcast()
    draw_science()
    draw_art_homeec()
    draw_music_gym_changing()
    draw_window_link_options()
    draw_roof_link_options()
    print(f"B03_DESIGN_DIAGRAMS={OUTPUT_DIRECTORY}")


if __name__ == "__main__":
    main()
