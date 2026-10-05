# Firmware-ul de arbitraj cu interfata LVGL.
#
# Proiect separat dinadins. Firmware-ul de productie
# (../referee-esp32s3-28b-idf) merge curat si nu se atinge pana nu stim
# raspunsul. Dar panoul se porneste din exact aceleasi fisiere, cu exact
# aceleasi reglaje, altfel cifrele n-ar fi comparabile cu cele de acolo.
#
# Ce masuram: linia HZ. Daca ramane pe teoretic (46.8) cu LVGL desenand si cu
# radioul asociat, LVGL incape. Daca scade, nu incape, si aflam asta dupa un
# ecran, nu dupa ce am rescris toata interfata.
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)

# Dupa include, nu inainte: idf_build_set_property vine din project.cmake.
# USB CDC pe boot, ca Serial sa fie HWCDC si sa aiba setTxTimeoutMs().
# Comutatorul de interfata. Sketch-ul include desen_lvgl.inc in loc de
# desen_gfx.inc cand vede asta - vezi referee-esp32s3-28b.ino.
idf_build_set_property(COMPILE_OPTIONS "-DUI_LVGL=1" APPEND)

idf_build_set_property(COMPILE_OPTIONS "-DARDUINO_USB_MODE=1" APPEND)
idf_build_set_property(COMPILE_OPTIONS "-DARDUINO_USB_CDC_ON_BOOT=1" APPEND)

project(referee-esp32s3-28b-lvgl)
