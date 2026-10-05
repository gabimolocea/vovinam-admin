// Punctul de intrare pentru varianta cu LVGL.
//
// Acelasi sketch ca firmware-ul de productie - chiar acelasi fisier, nu o
// copie. Singura diferenta e UI_LVGL din CMakeLists.txt, care face sketch-ul
// sa includa desen_lvgl.inc in loc de desen_gfx.inc. Logica de dedesubt -
// PIN, HTTP, regulile de arbitraj - nu stie care din ele e legata.
#include <Arduino.h>
#include "referee-esp32s3-28b.ino"
