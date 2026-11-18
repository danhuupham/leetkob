#include <cstdio>
#include <cstring>

char s[100005];

void reverse(char* l, char* r) {   // dao doan [l, r]
    while (l < r) {
        *l ^= *r;
        *r ^= *l;
        *l ^= *r;
        l++, r--;
    }
}

int main() {
    if (!fgets(s, sizeof(s), stdin)) return 0;
    int n = strlen(s);
    if (n > 0 && s[n - 1] == '\n') s[--n] = '\0';
    int i = 0;
    while (i < n) {
        int j = i;
        while (j < n && s[j] != ' ') j++;
        reverse(s + i, s + j - 1);
        i = j + 1;
    }
    puts(s);
    return 0;
}
