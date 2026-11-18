#include <cstdio>

int a[1005];

int main() {
    int n, i = 0;
    long long s = 0;
    scanf("%d", &n);
doc:
    if (i < n) {
        scanf("%d", &a[i]);
        s += a[i];
        i++;
        goto doc;
    }
    i = n - 1;
ra:
    if (i >= 0) {
        printf("%d ", a[i]);
        i--;
        goto ra;
    }
    printf("\n%lld\n", s);
    return 0;
}
