#include <iostream>
#include <sstream>
#include <string>
using namespace std;

string lat(const string& w) {
    return string(w.rbegin(), w.rend());
}

int main() {
    string line;
    getline(cin, line);
    istringstream in(line);
    string w;
    bool first = true;
    while (in >> w) {
        if (!first) cout << " ";
        cout << lat(w);
        first = false;
    }
    cout << endl;
    return 0;
}
