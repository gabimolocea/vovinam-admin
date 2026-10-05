// Punctul de intrare pentru ESP-IDF.
//
// Sketch-ul e inclus ca text, nu copiat: fisierul .ino de langa build-ul
// Arduino e singura sursa a aplicatiei, iar aici doar i se da un .cpp in care
// sa intre. Asa nu exista doua variante care se despart la prima corectie.
//
// Functioneaza fara nicio modificare in el fiindca:
//
//   - nucleul Arduino e inclus ca component ESP-IDF (vezi idf_component.yml),
//     deci Arduino.h, WiFi, HTTPClient si Preferences sunt exact aceleasi;
//   - CONFIG_AUTOSTART_ARDUINO porneste singur setup() si loop();
//   - declaratiile de functii pe care Arduino le genereaza automat sunt acum
//     scrise in sketch (vezi sectiunea DECLARATII DE FUNCTII din el), fiindca
//     ESP-IDF compileaza C++ obisnuit si nu le inventeaza.

#include <Arduino.h>
#include "referee-esp32s3-28b.ino"
