#include <cstdio>
#include <algorithm>

int a[5005], tam[5005];

void tron(int trai, int giua, int phai) {
    int i = trai, j = giua, k = trai;
    while (i < giua && j < phai) {
        if (a[i] <= a[j]) tam[k++] = a[i++];
        else tam[k++] = a[j++];
    }
    while (i < giua) tam[k++] = a[i++];
    while (j < phai) tam[k++] = a[j++];
    for (k = trai; k < phai; k++) a[k] = tam[k];
}

int main() {
    int n;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    for (int doRong = 1; doRong < n; doRong *= 2) {
        for (int trai = 0; trai < n; trai += 2 * doRong) {
            int giua = std::min(trai + doRong, n);
            int phai = std::min(trai + 2 * doRong, n);
            tron(trai, giua, phai);
        }
    }
    for (int i = 0; i < n; i++) printf("%d ", a[i]);
    printf("\n");
    return 0;
}
