#include <cstdio>
#include <iostream>
#include <unistd.h>

int main() {
  const char* paths[] = {
    "/var/run/docker.sock",
    "/app/src/server.js",
    "/app/package.json",
  };
  for (const char* path : paths) {
    if (access(path, F_OK) == 0) {
      std::cout << "PWNED\n";
      return 0;
    }
    FILE* f = std::fopen(path, "r");
    if (f != nullptr) {
      std::fclose(f);
      std::cout << "PWNED\n";
      return 0;
    }
  }
  return 1;
}
