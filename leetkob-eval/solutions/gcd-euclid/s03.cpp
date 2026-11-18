#include <cstdio>

// std::gcd va __gcd bi cam trong bai nay
int gcdTru(int a, int b) {
    while (a != b) {
        if (a > b) a -= b;
        else b -= a;
    }
    return a;
}

int main() {
    int q;
    scanf("%d", &q);
    while (q--) {
        int a, b;
        scanf("%d %d", &a, &b);
        int g = gcdTru(a, b);
        printf("%d %lld\n", g, (long long)a / g * b);
    }
    return 0;
}
