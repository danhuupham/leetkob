#include <cstdio>

int day[1005];

int timKiem(int trai, int phai, int x) {
    if (trai > phai) return -1;
    int giua = trai + (phai - trai) / 2;
    if (day[giua] == x) return giua + 1;
    if (day[giua] > x) return timKiem(trai, giua - 1, x);
    return timKiem(giua + 1, phai, x);
}

int main() {
    int n, q, x;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &day[i]);
    scanf("%d", &q);
    while (q--) {
        scanf("%d", &x);
        printf("%d\n", timKiem(0, n - 1, x));
    }
    return 0;
}
