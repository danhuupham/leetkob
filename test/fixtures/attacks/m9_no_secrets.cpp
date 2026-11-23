#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>

int main() {
  const char* envNames[] = {
    "MODEL_API_KEY",
    "SESSION_SECRET",
    "DATABASE_URL",
  };
  for (const char* name : envNames) {
    const char* val = std::getenv(name);
    if (val != nullptr && val[0] != '\0') {
      std::cout << "PWNED\n";
      return 0;
    }
  }

  std::ifstream procEnv("/proc/self/environ", std::ios::binary);
  if (procEnv.is_open()) {
    std::string raw((std::istreambuf_iterator<char>(procEnv)), std::istreambuf_iterator<char>());
    if (raw.find("MODEL_API_KEY=") != std::string::npos ||
        raw.find("SESSION_SECRET=") != std::string::npos ||
        raw.find("DATABASE_URL=") != std::string::npos) {
      std::cout << "PWNED\n";
      return 0;
    }
  }

  const char* envFiles[] = {"/app/.env", "/.env"};
  for (const char* path : envFiles) {
    FILE* f = std::fopen(path, "r");
    if (f != nullptr) {
      std::fclose(f);
      std::cout << "PWNED\n";
      return 0;
    }
  }

  return 1;
}
